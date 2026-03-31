from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
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
  checkin_date_local: Mapped[str | None] = mapped_column(String(10), nullable=True)


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


class Member(Base):
  __tablename__ = "members"

  id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
  name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
  is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

