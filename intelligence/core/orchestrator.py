from __future__ import annotations

from datetime import date
from typing import List, Optional, Tuple

from ..agents import build_daily_plan, enrich, run_intake, run_reflection
from ..memory import StateStore, VectorStore
from ..skills import next_review_after_session, summarize
from .config import Settings
from .schemas import DailyPlan, IntakeResult, ReflectionResult


class Orchestrator:
  """Wires intake → knowledge → planning → reflection."""

  def __init__(self, settings: Settings) -> None:
    self.settings = settings
    self.store = StateStore(settings.db_path)
    self.vectors = VectorStore(settings)

  def ingest(self, raw: str, source: str = "manual") -> Tuple[IntakeResult, int]:
    intake = run_intake(raw, source, self.settings)
    summary = summarize(intake.content, self.settings)
    tags, mastery = enrich(intake, summary, self.settings)
    nr = next_review_after_session(mastery, today=date.today())
    kid, _ = self.store.upsert_knowledge(
      topic=intake.topic,
      summary=summary,
      tags=tags,
      mastery=mastery,
      next_review=nr,
      source=intake.source or source,
      raw_content=intake.content,
    )
    chunk = f"{intake.topic}\n{summary}"
    self.vectors.add(chunk, doc_id=kid)
    return intake, kid

  def plan_today(self, *, today: Optional[date] = None) -> DailyPlan:
    d = today or date.today()
    items = self.store.list_knowledge()
    plan = build_daily_plan(items, today=d, settings=self.settings)
    self.store.save_daily_plan(plan)
    return plan

  def reflect(self, what_felt_easy: str) -> ReflectionResult:
    items = self.store.list_knowledge()
    topics = [k.topic for k in items[:10]]
    result = run_reflection(what_felt_easy, topics=topics, settings=self.settings)
    self.store.add_reflection(date.today(), result.text)
    return result

  def related(self, query: str, k: int = 5) -> List[Tuple[int, float, str]]:
    return self.vectors.search(query, k=k)
