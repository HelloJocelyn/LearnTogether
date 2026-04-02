from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field


def _default_db_path() -> Path:
  root = Path(__file__).resolve().parent.parent
  data = root / "data"
  data.mkdir(parents=True, exist_ok=True)
  return data / "study.db"


class Settings(BaseModel):
  """Runtime configuration (env-backed)."""

  openai_api_key: Optional[str] = None
  openai_base_url: str = "https://api.openai.com/v1"
  llm_model: str = "gpt-4o-mini"
  embedding_model: str = "text-embedding-3-small"
  db_path: Path = Field(default_factory=_default_db_path)
  max_daily_tasks: int = Field(default=2, ge=1, le=3)
  faiss_path: Optional[Path] = None

  @classmethod
  def from_env(cls) -> "Settings":
    db = os.environ.get("INTELLIGENCE_DB_PATH")
    faiss = os.environ.get("INTELLIGENCE_FAISS_PATH")
    max_tasks = int(os.environ.get("INTELLIGENCE_MAX_DAILY_TASKS", "2"))
    return cls(
      openai_api_key=os.environ.get("OPENAI_API_KEY"),
      openai_base_url=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
      llm_model=os.environ.get("INTELLIGENCE_LLM_MODEL", "gpt-4o-mini"),
      embedding_model=os.environ.get("INTELLIGENCE_EMBEDDING_MODEL", "text-embedding-3-small"),
      db_path=Path(db).resolve() if db else _default_db_path(),
      max_daily_tasks=max(1, min(3, max_tasks)),
      faiss_path=Path(faiss).resolve() if faiss else None,
    )


@lru_cache
def get_settings() -> Settings:
  return Settings.from_env()
