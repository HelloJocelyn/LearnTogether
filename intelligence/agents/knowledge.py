from __future__ import annotations

import re
from typing import List, Tuple

from ..core.config import Settings
from ..core.schemas import IntakeResult


def _tags_from_text(topic: str, summary: str) -> List[str]:
  words = re.findall(r"[a-zA-Z]{3,}", f"{topic} {summary}".lower())
  stop = {"the", "and", "for", "with", "this", "that", "from", "have", "has", "are", "was", "were"}
  seen: set[str] = set()
  tags: List[str] = []
  for w in words:
    if w in stop or w in seen:
      continue
    seen.add(w)
    tags.append(w)
    if len(tags) >= 8:
      break
  return tags or ["study"]


def enrich(intake: IntakeResult, summary: str, settings: Settings) -> Tuple[List[str], float]:
  """
  Derive tags and a conservative mastery estimate from intake + summary.
  Settings reserved for future LLM-based tagging.
  """
  _ = settings
  tags = _tags_from_text(intake.topic, summary)
  # Shorter / vaguer notes → assume less mastery confidence (lower score)
  base = 0.35 + min(0.25, len(summary) / 2000.0)
  difficulty_adj = (1.0 - intake.difficulty) * 0.15
  mastery = max(0.15, min(0.85, base + difficulty_adj))
  return tags, mastery
