from __future__ import annotations

from datetime import date, timedelta
from typing import Optional


def next_review_after_session(mastery: float, *, today: Optional[date] = None) -> date:
  """
  Simple spaced schedule: lower mastery → sooner review.
  mastery in [0,1]; higher mastery → longer gap.
  """
  t = today or date.today()
  if mastery < 0.35:
    gap = 1
  elif mastery < 0.55:
    gap = 3
  elif mastery < 0.75:
    gap = 7
  else:
    gap = 14
  return t + timedelta(days=gap)


def suggested_minutes(mastery: float) -> int:
  if mastery < 0.45:
    return 30
  if mastery < 0.7:
    return 25
  return 20
