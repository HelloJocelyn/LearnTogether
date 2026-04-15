from __future__ import annotations

from ..core import llm as llm_mod
from ..core.config import Settings
from ..core.schemas import IntakeResult


def _heuristic_intake(raw: str, source: str) -> IntakeResult:
  lines = [ln.strip() for ln in raw.strip().splitlines() if ln.strip()]
  topic = lines[0][:80] if lines else "study"
  if len(topic) > 60:
    topic = topic[:57] + "..."
  return IntakeResult(
    topic=topic,
    content=raw.strip(),
    difficulty=0.5,
    source=source,
  )


def run_intake(raw: str, source: str, settings: Settings) -> IntakeResult:
  """Structure raw study input into a normalized record."""
  if not settings.openai_api_key:
    return _heuristic_intake(raw, source)
  try:
    prompt = (
      "You extract study intake fields. Reply with JSON only, keys: "
      'type (always \"learning\"), topic (short), content (full cleaned text), '
      "difficulty (0-1 float), source.\n\n"
      f"Source label: {source}\n\nText:\n{raw[:12000]}"
    )
    raw_json = llm_mod.chat_completion(
      settings,
      [
        {"role": "system", "content": "Return compact JSON only. No markdown."},
        {"role": "user", "content": prompt},
      ],
      temperature=0.2,
      response_format_json=True,
    )
    data = llm_mod.parse_json_maybe(raw_json)
    return IntakeResult(
      topic=str(data.get("topic") or "study")[:200],
      content=str(data.get("content") or raw).strip(),
      difficulty=float(data.get("difficulty") or 0.5),
      source=str(data.get("source") or source),
    )
  except Exception:
    return _heuristic_intake(raw, source)
