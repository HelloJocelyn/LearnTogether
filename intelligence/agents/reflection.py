from __future__ import annotations

from typing import List

from ..core import llm as llm_mod
from ..core.config import Settings
from ..core.schemas import ReflectionResult


def run_reflection(
  what_felt_easy: str,
  *,
  topics: List[str],
  settings: Settings,
) -> ReflectionResult:
  """
  Stress-aware reflection: focus on what worked, not unfinished backlog.
  """
  topics_line = ", ".join(topics[:5]) if topics else "your studies"
  if not settings.openai_api_key:
    text = (
      f"You noted what felt easier today — that counts as progress.\n"
      f"Themes in focus: {topics_line}.\n"
      "Continue with a small, steady step tomorrow."
    )
    return ReflectionResult(text=text.strip())
  try:
    raw = llm_mod.chat_completion(
      settings,
      [
        {
          "role": "system",
          "content": (
            "You write brief, calming study reflections. "
            "Never guilt-trip. No backlog lists. "
            "2-4 short sentences. Acknowledge progress and suggest one gentle next step."
          ),
        },
        {
          "role": "user",
          "content": (
            f"What felt easy or flowed today (user words):\n{what_felt_easy}\n\n"
            f"Related topics: {topics_line}"
          ),
        },
      ],
      temperature=0.5,
    )
    return ReflectionResult(text=raw.strip())
  except Exception:
    text = (
      "Good work checking in. Carry one small win forward tomorrow — "
      f"you were touching: {topics_line}."
    )
    return ReflectionResult(text=text.strip())
