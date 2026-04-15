from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .core.config import get_settings
from .core.orchestrator import Orchestrator
from .core.schemas import DailyPlan, IntakeResult, ReflectionResult


class StudyInputBody(BaseModel):
  text: str = Field(..., min_length=1, max_length=50000)
  source: str = "api"


class ReflectionBody(BaseModel):
  what_felt_easy: str = Field(..., min_length=1, max_length=10000)


def create_app() -> FastAPI:
  app = FastAPI(title="Study Intelligence API", version="0.1.0")

  @app.get("/api/health")
  def health():
    return {"ok": True, "service": "intelligence"}

  @app.post("/api/intelligence/input", response_model=IntakeResult)
  def post_input(payload: StudyInputBody):
    settings = get_settings()
    orch = Orchestrator(settings)
    try:
      intake, _kid = orch.ingest(payload.text, source=payload.source)
    except Exception as e:
      raise HTTPException(status_code=500, detail=str(e)) from e
    return intake

  @app.get("/api/intelligence/plan/today", response_model=DailyPlan)
  def get_today_plan(day: Optional[date] = None):
    settings = get_settings()
    orch = Orchestrator(settings)
    try:
      return orch.plan_today(today=day)
    except Exception as e:
      raise HTTPException(status_code=500, detail=str(e)) from e

  @app.post("/api/intelligence/reflection", response_model=ReflectionResult)
  def post_reflection(payload: ReflectionBody):
    settings = get_settings()
    orch = Orchestrator(settings)
    try:
      return orch.reflect(payload.what_felt_easy)
    except Exception as e:
      raise HTTPException(status_code=500, detail=str(e)) from e

  return app


app = create_app()
