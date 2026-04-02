from __future__ import annotations

from datetime import date
from typing import List, Tuple

from ..core.config import Settings
from ..core.schemas import DailyPlan, DailyTask, KnowledgeRecord
from ..skills.scheduler import suggested_minutes


def build_daily_plan(
  items: List[KnowledgeRecord],
  *,
  today: date,
  settings: Settings,
) -> DailyPlan:
  """
  Pick up to `max_daily_tasks` topics: prioritize low mastery and overdue review.
  Does not expose a full backlog—only today's focus.
  """
  max_n = settings.max_daily_tasks
  if not items:
    return DailyPlan(
      date=today,
      tasks=[
        DailyTask(
          title="Add one short study note",
          minutes=15,
          topic="getting started",
        )
      ],
      note="No topics yet. Log something small today.",
    )

  def sort_key(k: KnowledgeRecord) -> Tuple[int, float, int]:
    overdue = 0
    if k.next_review and k.next_review <= today:
      overdue = 1
    return (-overdue, k.mastery, k.id)

  ranked = sorted(items, key=sort_key)
  picked = ranked[:max_n]
  tasks: List[DailyTask] = []
  for k in picked:
    minutes = suggested_minutes(k.mastery)
    title = f"{k.topic} — review & practice"
    tasks.append(DailyTask(title=title, minutes=minutes, topic=k.topic))
  return DailyPlan(date=today, tasks=tasks, note="Ignore everything else.")
