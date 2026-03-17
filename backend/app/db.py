import os

from sqlalchemy import create_engine
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

