from __future__ import annotations

from datetime import date
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class IntakeResult(BaseModel):
  type: Literal["learning"] = "learning"
  topic: str
  content: str
  difficulty: float = Field(ge=0.0, le=1.0)
  source: str


class KnowledgeRecord(BaseModel):
  id: int
  topic: str
  summary: str
  tags: List[str]
  mastery: float = Field(ge=0.0, le=1.0)
  next_review: Optional[date] = None


class DailyTask(BaseModel):
  title: str
  minutes: int = 20
  topic: str


class DailyPlan(BaseModel):
  date: date
  tasks: List[DailyTask]
  note: str = "Ignore everything else."


class ReflectionResult(BaseModel):
  text: str
