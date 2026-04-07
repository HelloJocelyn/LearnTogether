import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


def _default_sqlite_url() -> str:
  # Local dev default (no Docker): keep DB next to backend folder.
  return "sqlite:///./app.db"


DATABASE_URL = os.getenv("DATABASE_URL", _default_sqlite_url())


class Base(DeclarativeBase):
  pass


engine = create_engine(
  DATABASE_URL,
  connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
  db = SessionLocal()
  try:
    yield db
  finally:
    db.close()


def init_db() -> None:
  from . import models  # noqa: F401

  Base.metadata.create_all(bind=engine)

  # Minimal migration for early-stage dev: add new columns if needed.
  if DATABASE_URL.startswith("sqlite"):
    insp = inspect(engine)
    if "checkins" in insp.get_table_names():
      cols = {c["name"] for c in insp.get_columns("checkins")}
      if "is_real" not in cols:
        with engine.begin() as conn:
          conn.execute(text("ALTER TABLE checkins ADD COLUMN is_real BOOLEAN NOT NULL DEFAULT 0"))
      if "checkin_date_local" not in cols:
        with engine.begin() as conn:
          conn.execute(text("ALTER TABLE checkins ADD COLUMN checkin_date_local TEXT"))

