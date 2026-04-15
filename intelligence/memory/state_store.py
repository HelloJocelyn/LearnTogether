from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..core.schemas import DailyPlan, DailyTask, KnowledgeRecord


def _utc_now_iso() -> str:
  return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _norm_topic(topic: str) -> str:
  return " ".join(topic.lower().split())


class StateStore:
  """SQLite persistence for knowledge and lightweight daily cache."""

  def __init__(self, path: Path) -> None:
    self.path = path
    self._init()

  def _connect(self) -> sqlite3.Connection:
    self.path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(self.path)
    conn.row_factory = sqlite3.Row
    return conn

  def _init(self) -> None:
    with self._connect() as conn:
      conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS knowledge_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic TEXT NOT NULL,
          topic_norm TEXT NOT NULL UNIQUE,
          summary TEXT NOT NULL,
          tags TEXT NOT NULL,
          mastery REAL NOT NULL DEFAULT 0.4,
          next_review TEXT,
          source TEXT NOT NULL DEFAULT '',
          raw_content TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_knowledge_mastery ON knowledge_items(mastery);
        CREATE TABLE IF NOT EXISTS daily_plans (
          plan_date TEXT PRIMARY KEY,
          tasks_json TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS reflections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_date TEXT NOT NULL,
          text TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        """
      )

  def upsert_knowledge(
    self,
    *,
    topic: str,
    summary: str,
    tags: List[str],
    mastery: float,
    next_review: Optional[date],
    source: str,
    raw_content: str,
  ) -> Tuple[int, bool]:
    topic_norm = _norm_topic(topic)
    nr = next_review.isoformat() if next_review else None
    created = _utc_now_iso()
    with self._connect() as conn:
      row = conn.execute(
        "SELECT id FROM knowledge_items WHERE topic_norm = ?",
        (topic_norm,),
      ).fetchone()
      if row:
        kid = int(row["id"])
        conn.execute(
          """
          UPDATE knowledge_items
          SET topic = ?, summary = ?, tags = ?, mastery = ?, next_review = ?,
              source = ?, raw_content = ?
          WHERE id = ?
          """,
          (
            topic,
            summary,
            json.dumps(tags),
            mastery,
            nr,
            source,
            raw_content,
            kid,
          ),
        )
        return kid, False
      cur = conn.execute(
        """
        INSERT INTO knowledge_items
          (topic, topic_norm, summary, tags, mastery, next_review, source, raw_content, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
          topic,
          topic_norm,
          summary,
          json.dumps(tags),
          mastery,
          nr,
          source,
          raw_content,
          created,
        ),
      )
      return int(cur.lastrowid), True

  def list_knowledge(self) -> List[KnowledgeRecord]:
    with self._connect() as conn:
      rows = conn.execute(
        "SELECT id, topic, summary, tags, mastery, next_review FROM knowledge_items ORDER BY mastery ASC, id ASC"
      ).fetchall()
    out: List[KnowledgeRecord] = []
    for r in rows:
      nr = r["next_review"]
      out.append(
        KnowledgeRecord(
          id=int(r["id"]),
          topic=r["topic"],
          summary=r["summary"],
          tags=json.loads(r["tags"]) if r["tags"] else [],
          mastery=float(r["mastery"]),
          next_review=date.fromisoformat(nr) if nr else None,
        )
      )
    return out

  def get_knowledge_by_id(self, kid: int) -> Optional[Dict[str, Any]]:
    with self._connect() as conn:
      row = conn.execute(
        "SELECT * FROM knowledge_items WHERE id = ?",
        (kid,),
      ).fetchone()
    if not row:
      return None
    return {
      "id": int(row["id"]),
      "topic": row["topic"],
      "summary": row["summary"],
      "tags": json.loads(row["tags"]) if row["tags"] else [],
      "mastery": float(row["mastery"]),
      "next_review": date.fromisoformat(row["next_review"]) if row["next_review"] else None,
      "source": row["source"],
      "raw_content": row["raw_content"],
    }

  def save_daily_plan(self, plan: DailyPlan) -> None:
    ds = plan.date.isoformat()
    tasks = [t.model_dump() for t in plan.tasks]
    with self._connect() as conn:
      conn.execute(
        """
        INSERT INTO daily_plans (plan_date, tasks_json, note)
        VALUES (?, ?, ?)
        ON CONFLICT(plan_date) DO UPDATE SET tasks_json = excluded.tasks_json, note = excluded.note
        """,
        (ds, json.dumps(tasks), plan.note),
      )

  def get_daily_plan(self, d: date) -> Optional[DailyPlan]:
    ds = d.isoformat()
    with self._connect() as conn:
      row = conn.execute(
        "SELECT tasks_json, note FROM daily_plans WHERE plan_date = ?",
        (ds,),
      ).fetchone()
    if not row:
      return None
    tasks_data = json.loads(row["tasks_json"])
    tasks = [DailyTask(**t) for t in tasks_data]
    return DailyPlan(date=d, tasks=tasks, note=row["note"] or "Ignore everything else.")

  def add_reflection(self, d: date, text: str) -> None:
    with self._connect() as conn:
      conn.execute(
        "INSERT INTO reflections (plan_date, text, created_at) VALUES (?, ?, ?)",
        (d.isoformat(), text, _utc_now_iso()),
      )

  def latest_reflection(self, d: date) -> Optional[str]:
    with self._connect() as conn:
      row = conn.execute(
        """
        SELECT text FROM reflections WHERE plan_date = ? ORDER BY id DESC LIMIT 1
        """,
        (d.isoformat(),),
      ).fetchone()
    return row["text"] if row else None
