from __future__ import annotations

import re

from ..core import llm as llm_mod
from ..core.config import Settings


def _first_sentences(text: str, max_chars: int = 400) -> str:
  text = text.strip()
  if len(text) <= max_chars:
    return text
  parts = re.split(r"(?<=[.!?。！？])\s+", text)
  out = ""
  for p in parts:
    if len(out) + len(p) > max_chars:
      break
    out = f"{out} {p}".strip()
  return out or text[:max_chars]


def summarize(text: str, settings: Settings) -> str:
  """Short summary; uses LLM when configured, else truncation."""
  if not settings.openai_api_key:
    return _first_sentences(text)
  try:
    raw = llm_mod.chat_completion(
      settings,
      [
        {
          "role": "system",
          "content": "Summarize study notes in 2-3 short sentences. No preamble.",
        },
        {"role": "user", "content": text[:12000]},
      ],
      temperature=0.3,
    )
    return raw.strip() or _first_sentences(text)
  except Exception:
    return _first_sentences(text)
