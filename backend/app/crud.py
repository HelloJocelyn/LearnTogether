from datetime import datetime, time, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

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

