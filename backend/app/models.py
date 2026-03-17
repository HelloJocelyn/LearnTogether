from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
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

