import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
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
      if "status" not in cols:
        with engine.begin() as conn:
          conn.execute(
            text("ALTER TABLE checkins ADD COLUMN status TEXT NOT NULL DEFAULT 'outside'")
          )
          conn.execute(text("UPDATE checkins SET status = 'normal' WHERE is_real = 1"))

    if "achievement_badges" in insp.get_table_names():
      ab_cols = {c["name"] for c in insp.get_columns("achievement_badges")}
      if "member_id" not in ab_cols:
        with engine.begin() as conn:
          conn.execute(text("ALTER TABLE achievement_badges ADD COLUMN member_id INTEGER"))
      if "certificate_image_filename" not in ab_cols:
        with engine.begin() as conn:
          conn.execute(
            text("ALTER TABLE achievement_badges ADD COLUMN certificate_image_filename TEXT")
          )

    if "members" in insp.get_table_names():
      m_cols = {c["name"] for c in insp.get_columns("members")}
      if "role" not in m_cols:
        with engine.begin() as conn:
          conn.execute(text("ALTER TABLE members ADD COLUMN role TEXT NOT NULL DEFAULT ''"))
      if "goal" not in m_cols:
        with engine.begin() as conn:
          conn.execute(text("ALTER TABLE members ADD COLUMN goal TEXT NOT NULL DEFAULT ''"))
      # Backfill older rows where name stored all three parts.
      with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, name, role, goal FROM members")).fetchall()
      for row in rows:
        name = str(row[1] or "").strip()
        role = str(row[2] or "").strip()
        goal = str(row[3] or "").strip()
        if role and goal:
          continue
        parts = [p for p in name.split() if p]
        if len(parts) >= 3:
          new_name = parts[0]
          new_role = parts[1]
          new_goal = " ".join(parts[2:])
          try:
            with engine.begin() as upd:
              upd.execute(
                text("UPDATE members SET name=:name, role=:role, goal=:goal WHERE id=:id"),
                {"id": row[0], "name": new_name, "role": new_role, "goal": new_goal},
              )
          except IntegrityError:
            pass

