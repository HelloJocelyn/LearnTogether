from __future__ import annotations

import pickle
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import faiss
import numpy as np

from ..core.config import Settings
from ..core import llm as llm_mod

# text-embedding-3-small dimension
_EMBED_DIM = 1536


def _tokenize(text: str) -> Set[str]:
  return set(re.findall(r"[a-zA-Z0-9\u4e00-\u9fff]+", text.lower()))


def _overlap_score(query: str, doc: str) -> float:
  q, d = _tokenize(query), _tokenize(doc)
  if not q or not d:
    return 0.0
  return len(q & d) / (len(q) ** 0.5 * len(d) ** 0.5 + 1e-9)


class VectorStore:
  """
  FAISS-backed embeddings when API key is set; lexical fallback otherwise.
  Persists index + metadata to disk when faiss_path is set.
  """

  def __init__(self, settings: Settings) -> None:
    self._settings = settings
    self._base = settings.faiss_path or (settings.db_path.parent / "vector_store")
    self._base.parent.mkdir(parents=True, exist_ok=True)
    self._index_path = Path(self._base).with_suffix(".faiss")
    self._meta_path = Path(self._base).with_suffix(".meta.pkl")
    self._index: Optional[faiss.Index] = None
    self._id_to_text: Dict[int, str] = {}
    self._lexical: List[Tuple[int, str]] = []
    self._next_id = 1
    self._load_or_init()

  def _load_or_init(self) -> None:
    if self._index_path.exists() and self._meta_path.exists():
      self._index = faiss.read_index(str(self._index_path))
      with open(self._meta_path, "rb") as f:
        meta = pickle.load(f)
      self._id_to_text = meta["id_to_text"]
      self._next_id = int(meta["next_id"])
      self._lexical = [(int(i), t) for i, t in sorted(self._id_to_text.items(), key=lambda x: x[0])]
      return
    self._index = faiss.IndexIDMap(faiss.IndexFlatL2(_EMBED_DIM))
    self._id_to_text = {}
    self._lexical = []
    self._next_id = 1

  def _save(self) -> None:
    if self._index is not None and self._index_path:
      faiss.write_index(self._index, str(self._index_path))
      with open(self._meta_path, "wb") as f:
        pickle.dump({"id_to_text": self._id_to_text, "next_id": self._next_id}, f)

  def add(self, text: str, *, doc_id: Optional[int] = None) -> int:
    """Index a document; returns internal id."""
    if doc_id is None:
      doc_id = self._next_id
      self._next_id += 1
    else:
      self._next_id = max(self._next_id, doc_id + 1)
    self._id_to_text[doc_id] = text
    self._lexical = [(i, t) for i, t in self._lexical if i != doc_id]
    self._lexical.append((doc_id, text))
    if self._settings.openai_api_key and self._index is not None:
      self._remove_id(doc_id)
      vecs = llm_mod.embeddings(self._settings, [text])
      v = np.array(vecs, dtype="float32")
      faiss.normalize_L2(v)
      ids = np.array([doc_id], dtype="int64")
      self._index.add_with_ids(v, ids)
    self._save()
    return doc_id

  def _remove_id(self, doc_id: int) -> None:
    if self._index is None or self._index.ntotal == 0:
      return
    if not hasattr(self._index, "remove_ids"):
      return
    try:
      self._index.remove_ids(np.array([doc_id], dtype="int64"))
    except Exception:
      pass

  def search(self, query: str, k: int = 5) -> List[Tuple[int, float, str]]:
    """Returns (id, score, text). Lower score is better for L2; higher for lexical."""
    if self._settings.openai_api_key and self._index is not None and self._index.ntotal > 0:
      vecs = llm_mod.embeddings(self._settings, [query])
      v = np.array(vecs, dtype="float32")
      faiss.normalize_L2(v)
      scores, ids = self._index.search(v, min(k, self._index.ntotal))
      out: List[Tuple[int, float, str]] = []
      for dist, i in zip(scores[0], ids[0]):
        if i < 0:
          continue
        tid = int(i)
        out.append((tid, float(dist), self._id_to_text.get(tid, "")))
      return out
    ranked: List[Tuple[int, float, str]] = []
    for tid, text in self._lexical:
      s = -_overlap_score(query, text)
      ranked.append((tid, s, text))
    ranked.sort(key=lambda x: x[1])
    return ranked[:k]
