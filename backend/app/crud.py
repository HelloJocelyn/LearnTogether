from datetime import date, datetime, time, timezone, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.sql import and_

from .models import CheckIn, Item


def _is_real_checkin(*, now: datetime, tz_name: Optional[str]) -> bool:
  local = now.astimezone(ZoneInfo(tz_name)) if tz_name else now.astimezone()
  t = local.timetz().replace(tzinfo=None)
  start = time(4, 30)
  end = time(6, 0)
  return start <= t <= end


def list_items(db: Session) -> list[Item]:
  return list(db.scalars(select(Item).order_by(Item.id.desc())).all())


def create_item(db: Session, *, title: str) -> Item:
  item = Item(title=title)
  db.add(item)
  db.commit()
  db.refresh(item)
  return item


def list_checkins(db: Session, *, limit: int = 50, real_only: bool = False) -> list[CheckIn]:
  stmt = select(CheckIn).order_by(CheckIn.id.desc()).limit(limit)
  if real_only:
    stmt = stmt.where(CheckIn.is_real.is_(True))
  return list(db.scalars(stmt).all())


def _utc_range_from_local_dates(*, start_date: str, end_date: str, tz_name: Optional[str]) -> tuple[datetime, datetime]:
  # start_date/end_date are YYYY-MM-DD and are interpreted in tz_name (defaults to server timezone).
  start_local = datetime.fromisoformat(start_date).replace(tzinfo=ZoneInfo(tz_name)) if tz_name else datetime.fromisoformat(start_date).replace(tzinfo=None)
  # Ensure we're starting at local midnight.
  start_local = datetime(start_local.year, start_local.month, start_local.day, 0, 0, 0, tzinfo=start_local.tzinfo)

  end_dt = datetime.fromisoformat(end_date)
  end_local = datetime(end_dt.year, end_dt.month, end_dt.day, 0, 0, 0, tzinfo=ZoneInfo(tz_name) if tz_name else None)

  # Make end exclusive: [start, end)
  start_utc = start_local.astimezone(timezone.utc)
  end_utc = end_local.astimezone(timezone.utc)
  return start_utc, end_utc


def list_checkins_range(
  db: Session,
  *,
  limit: int = 50,
  real_only: bool = False,
  start_date: Optional[str] = None,
  end_date: Optional[str] = None,
  tz_name: Optional[str] = None,
) -> list[CheckIn]:
  stmt = select(CheckIn).order_by(CheckIn.id.desc()).limit(limit)
  if real_only:
    stmt = stmt.where(CheckIn.is_real.is_(True))

  if start_date and end_date:
    start_utc, end_utc = _utc_range_from_local_dates(start_date=start_date, end_date=end_date, tz_name=tz_name)
    stmt = stmt.where(and_(CheckIn.created_at >= start_utc, CheckIn.created_at < end_utc))
  return list(db.scalars(stmt).all())


def create_checkin(db: Session, *, nickname: str, tz_name: Optional[str] = None) -> CheckIn:
  now = datetime.now(timezone.utc)
  checkin = CheckIn(
    created_at=now,
    nickname=nickname,
    is_real=_is_real_checkin(now=now, tz_name=tz_name),
  )
  db.add(checkin)
  db.commit()
  db.refresh(checkin)
  return checkin

