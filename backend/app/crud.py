from datetime import datetime, time, timezone, timedelta
import logging
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql import and_

from .models import AttendanceImport, AttendanceImportItem, CheckIn, Item, Member

logger = logging.getLogger("uvicorn.error")


def _parse_hhmm(raw: Optional[str], fallback: time) -> time:
  if not raw:
    return fallback
  value = raw.strip()
  try:
    hh, mm = value.split(":", 1)
    h = int(hh)
    m = int(mm)
    if 0 <= h <= 23 and 0 <= m <= 59:
      return time(h, m)
  except (ValueError, TypeError):
    pass
  return fallback


def _is_real_checkin(
  *, now: datetime, tz_name: Optional[str], window_start: Optional[str], window_end: Optional[str]
) -> bool:
  local = now.astimezone(ZoneInfo(tz_name)) if tz_name else now.astimezone()
  t = local.timetz().replace(tzinfo=None)
  start = _parse_hhmm(window_start, time(4, 30))
  end = _parse_hhmm(window_end, time(6, 0))
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
    if start_date and end_date and end_date == (
      datetime.fromisoformat(start_date).date() + timedelta(days=1)
    ).isoformat():
      # Fast path for local single-day query using stored local-date column.
      # Be tolerant with legacy/local formatting like 2026/4/1.
      day = datetime.fromisoformat(start_date).date()
      variants = {
        day.isoformat(),  # 2026-04-01
        f"{day.year}/{day.month}/{day.day}",  # 2026/4/1
        f"{day.year}/{day.month:02d}/{day.day:02d}",  # 2026/04/01
        f"{day.year}-{day.month}-{day.day}",  # 2026-4-1
      }
      start_utc, end_utc = _utc_range_from_local_dates(
        start_date=start_date, end_date=end_date, tz_name=tz_name
      )
      logger.warning(
        "list_checkins_range single-day: start=%s end=%s tz=%s variants=%s utc_start=%s utc_end=%s",
        start_date,
        end_date,
        tz_name,
        sorted(variants),
        start_utc.isoformat(),
        end_utc.isoformat(),
      )
      stmt = stmt.where(
        or_(
          CheckIn.checkin_date_local.in_(sorted(variants)),
          and_(CheckIn.created_at >= start_utc, CheckIn.created_at < end_utc),
        )
      )
    else:
      start_utc, end_utc = _utc_range_from_local_dates(
        start_date=start_date, end_date=end_date, tz_name=tz_name
      )
      stmt = stmt.where(and_(CheckIn.created_at >= start_utc, CheckIn.created_at < end_utc))
  rows = list(db.scalars(stmt).all())
  logger.warning(
    "list_checkins_range result: start=%s end=%s tz=%s count=%s",
    start_date,
    end_date,
    tz_name,
    len(rows),
  )
  return rows


def create_checkin(
  db: Session,
  *,
  nickname: str,
  tz_name: Optional[str] = None,
  window_start: Optional[str] = None,
  window_end: Optional[str] = None,
) -> CheckIn:
  now = datetime.now(timezone.utc)

  # Prevent duplicate check-ins for the same nickname within the same *local* day.
  # Keep the earliest one.
  local_now = now.astimezone(ZoneInfo(tz_name)) if tz_name else now.astimezone()
  local_date_text = local_now.date().isoformat()
  existing = list(
    db.scalars(
      select(CheckIn)
      .where(
        and_(
          CheckIn.nickname == nickname,
          CheckIn.checkin_date_local == local_date_text,
        )
      )
      .order_by(CheckIn.created_at.asc(), CheckIn.id.asc())
      .limit(1)
    ).all()
  )
  if existing:
    earliest = existing[0]
    refreshed_is_real = _is_real_checkin(
      now=earliest.created_at,
      tz_name=tz_name,
      window_start=window_start,
      window_end=window_end,
    )
    if earliest.is_real != refreshed_is_real:
      earliest.is_real = refreshed_is_real
      db.commit()
      db.refresh(earliest)
    return earliest

  checkin = CheckIn(
    created_at=now,
    nickname=nickname,
    checkin_date_local=local_date_text,
    is_real=_is_real_checkin(
      now=now, tz_name=tz_name, window_start=window_start, window_end=window_end
    ),
  )
  db.add(checkin)
  db.commit()
  db.refresh(checkin)
  return checkin


def create_attendance_import(
  db: Session, *, source_filename: str, ocr_raw_text: str, items: list[dict[str, object]]
) -> tuple[AttendanceImport, list[AttendanceImportItem]]:
  now = datetime.now(timezone.utc)
  record = AttendanceImport(
    created_at=now,
    source_filename=source_filename,
    ocr_raw_text=ocr_raw_text,
    status="draft",
  )
  db.add(record)
  db.flush()

  created_items: list[AttendanceImportItem] = []
  for item in items:
    created = AttendanceImportItem(
      import_id=record.id,
      name=str(item["name"]),
      attendance_status=str(item["attendance_status"]),
      confidence=int(item.get("confidence", 0)),
      is_edited=False,
    )
    db.add(created)
    created_items.append(created)

  db.commit()
  db.refresh(record)
  for item in created_items:
    db.refresh(item)
  return record, created_items


def get_attendance_import(
  db: Session, *, import_id: int
) -> tuple[AttendanceImport | None, list[AttendanceImportItem]]:
  record = db.get(AttendanceImport, import_id)
  if record is None:
    return None, []

  items = list(
    db.scalars(
      select(AttendanceImportItem)
      .where(AttendanceImportItem.import_id == import_id)
      .order_by(AttendanceImportItem.id.asc())
    ).all()
  )
  return record, items


def update_attendance_import_items(
  db: Session, *, import_id: int, items: list[dict[str, object]]
) -> list[AttendanceImportItem]:
  existing = list(
    db.scalars(select(AttendanceImportItem).where(AttendanceImportItem.import_id == import_id)).all()
  )
  existing_by_id = {item.id: item for item in existing}
  kept_ids: set[int] = set()

  for payload in items:
    raw_id = payload.get("id")
    name = str(payload["name"]).strip()
    status = str(payload["attendance_status"])

    if isinstance(raw_id, int) and raw_id in existing_by_id:
      target = existing_by_id[raw_id]
      changed = target.name != name or target.attendance_status != status
      target.name = name
      target.attendance_status = status
      if changed:
        target.is_edited = True
      kept_ids.add(target.id)
      continue

    new_item = AttendanceImportItem(
      import_id=import_id,
      name=name,
      attendance_status=status,
      confidence=0,
      is_edited=True,
    )
    db.add(new_item)
    db.flush()
    kept_ids.add(new_item.id)

  for item in existing:
    if item.id not in kept_ids:
      db.delete(item)

  db.commit()

  return list(
    db.scalars(
      select(AttendanceImportItem)
      .where(AttendanceImportItem.import_id == import_id)
      .order_by(AttendanceImportItem.id.asc())
    ).all()
  )


def confirm_attendance_import(
  db: Session, *, import_id: int
) -> tuple[AttendanceImport | None, dict[str, int]]:
  record = db.get(AttendanceImport, import_id)
  if record is None:
    return None, {"total": 0, "attended": 0, "not_attended": 0, "unknown": 0}

  items = list(
    db.scalars(select(AttendanceImportItem).where(AttendanceImportItem.import_id == import_id)).all()
  )
  counts = {"total": len(items), "attended": 0, "not_attended": 0, "unknown": 0}
  for item in items:
    if item.attendance_status == "attended":
      counts["attended"] += 1
    elif item.attendance_status == "not_attended":
      counts["not_attended"] += 1
    else:
      counts["unknown"] += 1

  record.status = "confirmed"
  db.commit()
  db.refresh(record)
  return record, counts


def list_members(db: Session) -> list[Member]:
  stmt = select(Member).where(Member.is_active.is_(True)).order_by(Member.name.asc())
  return list(db.scalars(stmt).all())


def create_member(db: Session, *, name: str) -> Member:
  trimmed = name.strip()
  if not trimmed:
    raise ValueError("name is required")

  existing = list(
    db.scalars(
      select(Member).where(Member.name == trimmed, Member.is_active.is_(True)).limit(1)
    ).all()
  )
  if existing:
    return existing[0]

  now = datetime.now(timezone.utc)
  member = Member(created_at=now, name=trimmed, is_active=True)
  db.add(member)
  db.commit()
  db.refresh(member)
  return member


def deactivate_member(db: Session, *, member_id: int) -> None:
  member = db.get(Member, member_id)
  if member is None:
    return
  member.is_active = False
  db.commit()

