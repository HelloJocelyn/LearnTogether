from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import CheckIn, Item


def list_items(db: Session) -> list[Item]:
  return list(db.scalars(select(Item).order_by(Item.id.desc())).all())


def create_item(db: Session, *, title: str) -> Item:
  item = Item(title=title)
  db.add(item)
  db.commit()
  db.refresh(item)
  return item


def list_checkins(db: Session, *, limit: int = 50) -> list[CheckIn]:
  stmt = select(CheckIn).order_by(CheckIn.id.desc()).limit(limit)
  return list(db.scalars(stmt).all())


def create_checkin(db: Session, *, nickname: str) -> CheckIn:
  checkin = CheckIn(created_at=datetime.now(timezone.utc), nickname=nickname)
  db.add(checkin)
  db.commit()
  db.refresh(checkin)
  return checkin

