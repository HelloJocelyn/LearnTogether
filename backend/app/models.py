from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Item(Base):
  __tablename__ = "items"

  id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
  title: Mapped[str] = mapped_column(String(200), nullable=False)


class CheckIn(Base):
  __tablename__ = "checkins"

  id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
  nickname: Mapped[str] = mapped_column(String(80), nullable=False)
  is_real: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
  status: Mapped[str] = mapped_column(String(20), nullable=False, default="outside")
  checkin_date_local: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)


class AttendanceImport(Base):
  __tablename__ = "attendance_imports"

  id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
  source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
  ocr_raw_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
  status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")


class AttendanceImportItem(Base):
  __tablename__ = "attendance_import_items"

  id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
  import_id: Mapped[int] = mapped_column(
    Integer, ForeignKey("attendance_imports.id"), nullable=False, index=True
  )
  name: Mapped[str] = mapped_column(String(120), nullable=False)
  attendance_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
  confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  is_edited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
  # Early-session matrix CSV (番号 / 姓名 / per-day 状态·参加时间 / 出勤天数 / 备考)
  roll_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
  notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
  detail_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class Member(Base):
  __tablename__ = "members"

  id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
  name: Mapped[str] = mapped_column(String(80), nullable=False)
  role: Mapped[str] = mapped_column(String(80), nullable=False, default="")
  goal: Mapped[str] = mapped_column(String(80), nullable=False, default="")
  is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class DailyHero(Base):
  __tablename__ = "daily_heroes"

  id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
  hero_date_local: Mapped[str] = mapped_column(String(10), nullable=False, unique=True, index=True)
  theme: Mapped[str] = mapped_column(String(200), nullable=False)
  title: Mapped[str] = mapped_column(String(200), nullable=False)
  subtitle: Mapped[str] = mapped_column(String(400), nullable=False)
  image_filename: Mapped[str] = mapped_column(String(80), nullable=False)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LearningGoal(Base):
  """Full edition: user-defined learning goals (name, progress %, units, optional dates)."""

  __tablename__ = "learning_goals"

  id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
  name: Mapped[str] = mapped_column(String(200), nullable=False)
  progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  total_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  complete_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
  deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)


class AchievementBadge(Base):
  """Certificate or exam passed (e.g. JLPT N1), shown on statistics for earned_date_local."""

  __tablename__ = "achievement_badges"

  id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
  nickname: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
  title: Mapped[str] = mapped_column(String(200), nullable=False)
  earned_date_local: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
  member_id: Mapped[Optional[int]] = mapped_column(
    Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True, index=True
  )
  certificate_image_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

