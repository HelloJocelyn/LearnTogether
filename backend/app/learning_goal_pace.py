"""Linear pace between start_date and deadline vs complete_units (CHECKIN_TZ calendar dates)."""

from datetime import date
from typing import Optional, Tuple


def pace_expected_and_behind(
  *,
  start_date: Optional[date],
  deadline: Optional[date],
  total_units: int,
  complete_units: int,
  today: date,
) -> Tuple[bool, Optional[int]]:
  """
  Spread total_units evenly across [start_date, deadline].
  Returns (behind_pace, expected_units_floor).
  When behind is False, expected_units_floor may still be set for display; callers may ignore.
  """
  if total_units <= 0 or start_date is None or deadline is None:
    return False, None

  period_days = (deadline - start_date).days
  if period_days <= 0:
    return False, None

  if today < start_date:
    return False, None

  if today > deadline:
    if complete_units < total_units:
      return True, total_units
    return False, None

  elapsed = (today - start_date).days
  elapsed = min(max(0, elapsed), period_days)
  expected = (elapsed * total_units) // period_days if period_days else 0
  behind = complete_units < expected
  return behind, expected
