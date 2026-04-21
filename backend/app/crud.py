from datetime import date, datetime, time, timezone, timedelta
import json
import logging
import os
import re
from typing import Optional, Tuple
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session
from sqlalchemy.sql import and_

from .badge_storage import delete_stored_file
from .models import (
  AchievementBadge,
  AttendanceImport,
  AttendanceImportItem,
  CheckIn,
  DailyHero,
  Item,
  LearningGoal,
  Member,
)
from .schemas import derive_learning_goal_progress

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


def _minutes_from_clock(t: time) -> int:
  return t.hour * 60 + t.minute


def _in_window_inclusive(local_t: time, start_s: Optional[str], end_s: Optional[str], fb_start: time, fb_end: time) -> bool:
  start = _parse_hhmm(start_s, fb_start)
  end = _parse_hhmm(end_s, fb_end)
  m = _minutes_from_clock(local_t)
  a = _minutes_from_clock(start)
  b = _minutes_from_clock(end)
  return a <= m <= b


def _classify_checkin_status(
  *,
  now: datetime,
  tz_name: Optional[str],
  morning_start: Optional[str],
  morning_end: Optional[str],
  night_start: Optional[str],
  night_end: Optional[str],
) -> str:
  local = now.astimezone(ZoneInfo(tz_name)) if tz_name else now.astimezone()
  t = local.timetz().replace(tzinfo=None)
  if _in_window_inclusive(t, morning_start, morning_end, time(5, 0), time(8, 0)):
    return "morning"
  if _in_window_inclusive(t, night_start, night_end, time(19, 0), time(23, 0)):
    return "night"
  return "outside"


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
  requested_status: Optional[str] = None,
  tz_name: Optional[str] = None,
  morning_start: Optional[str] = None,
  morning_end: Optional[str] = None,
  night_start: Optional[str] = None,
  night_end: Optional[str] = None,
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
    refreshed_status = _classify_checkin_status(
      now=earliest.created_at,
      tz_name=tz_name,
      morning_start=morning_start,
      morning_end=morning_end,
      night_start=night_start,
      night_end=night_end,
    )
    if earliest.status != "leave" and earliest.status != refreshed_status:
      earliest.status = refreshed_status
      earliest.is_real = refreshed_status in {"morning", "night", "normal", "late"}
      db.commit()
      db.refresh(earliest)
    return earliest

  status = (
    "leave"
    if requested_status == "leave"
    else _classify_checkin_status(
      now=now,
      tz_name=tz_name,
      morning_start=morning_start,
      morning_end=morning_end,
      night_start=night_start,
      night_end=night_end,
    )
  )
  checkin = CheckIn(
    created_at=now,
    nickname=nickname,
    checkin_date_local=local_date_text,
    status=status,
    is_real=status in {"morning", "night", "normal", "late"},
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
    rn = item.get("roll_number")
    roll_number: Optional[int]
    if isinstance(rn, int):
      roll_number = rn
    elif isinstance(rn, str) and rn.strip().isdigit():
      roll_number = int(rn.strip())
    else:
      roll_number = None
    notes_raw = item.get("notes")
    created = AttendanceImportItem(
      import_id=record.id,
      name=str(item["name"]),
      attendance_status=str(item["attendance_status"]),
      confidence=int(item.get("confidence", 0)),
      is_edited=False,
      roll_number=roll_number,
      notes=str(notes_raw).strip() if notes_raw else None,
      detail_json=str(item["detail_json"]) if item.get("detail_json") else None,
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
) -> Tuple[Optional[AttendanceImport], list[AttendanceImportItem]]:
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


def upsert_checkin_from_import(
  db: Session,
  *,
  nickname: str,
  checkin_date_local: str,
  status: str,
  tz_name: str,
) -> None:
  trimmed = (nickname or "").strip()
  if not trimmed:
    return
  if len(trimmed) > 80:
    trimmed = trimmed[:80]
  allowed = {"morning", "night", "normal", "late", "leave", "outside"}
  st = status if status in allowed else "outside"
  is_real = st in {"morning", "night", "normal", "late"}

  existing = db.scalar(
    select(CheckIn).where(
      CheckIn.nickname == trimmed,
      CheckIn.checkin_date_local == checkin_date_local,
    )
  )
  created_at = _local_date_noon_utc(checkin_date_local, tz_name)
  if existing:
    existing.status = st
    existing.is_real = is_real
    return

  row = CheckIn(
    created_at=created_at,
    nickname=trimmed,
    checkin_date_local=checkin_date_local,
    status=st,
    is_real=is_real,
  )
  db.add(row)


def ensure_member_from_import(db: Session, *, name: str) -> Optional[Member]:
  trimmed = (name or "").strip()
  if not trimmed:
    return None
  if len(trimmed) > 80:
    trimmed = trimmed[:80]
  existing = db.scalar(
    select(Member).where(Member.name == trimmed, Member.is_active.is_(True)).limit(1)
  )
  if existing:
    return existing
  now = datetime.now(timezone.utc)
  row = Member(created_at=now, name=trimmed, role="", goal="", is_active=True)
  db.add(row)
  db.flush()
  return row


def _local_date_noon_utc(local_date_str: str, tz_name: str) -> datetime:
  d = date.fromisoformat(local_date_str)
  local_dt = datetime(d.year, d.month, d.day, 12, 0, 0, tzinfo=ZoneInfo(tz_name))
  return local_dt.astimezone(timezone.utc)


def _import_mark_bucket(mark: str) -> str:
  s = (mark or "").strip()
  if not s:
    return "empty"
  if "√" in s or s in {"✓"}:
    return "check"
  if "迟" in s:
    return "late"
  if "请" in s:
    return "leave"
  return "other"


def _bucket_to_checkin_status(bucket: str) -> Optional[str]:
  if bucket == "check":
    return "morning"
  if bucket == "late":
    return "late"
  if bucket == "leave":
    return "leave"
  return None


def _matrix_day_label_to_iso(label: str, year: int) -> Optional[str]:
  lab = (label or "").strip()
  mm = re.match(r"^(\d{1,2})/(\d{1,2})$", lab)
  if not mm:
    return None
  month_part = int(mm.group(1))
  day_part = int(mm.group(2))
  try:
    return date(year, month_part, day_part).isoformat()
  except ValueError:
    return None


def apply_attendance_import_side_effects(db: Session, *, import_id: int) -> None:
  """After marking import confirmed: upsert members (name, empty role/goal) and check-ins for statistics."""
  items = list(
    db.scalars(
      select(AttendanceImportItem).where(AttendanceImportItem.import_id == import_id).order_by(AttendanceImportItem.id.asc())
    ).all()
  )
  tz_name = _checkin_tz_default()

  for item in items:
    ensure_member_from_import(db, name=item.name)

    if item.detail_json:
      try:
        data = json.loads(item.detail_json)
      except json.JSONDecodeError:
        continue
      if data.get("format") == "early_session_matrix_v1":
        year = int(data.get("period_year") or date.today().year)
        for entry in data.get("daily") or []:
          mark = (entry.get("status") or "").strip()
          if not mark:
            continue
          bucket = _import_mark_bucket(mark)
          st = _bucket_to_checkin_status(bucket)
          if st is None:
            continue
          label = entry.get("date") or ""
          local_date = _matrix_day_label_to_iso(label, year)
          if not local_date:
            continue
          upsert_checkin_from_import(
            db,
            nickname=item.name,
            checkin_date_local=local_date,
            status=st,
            tz_name=tz_name,
          )
        continue

    flat_status = item.attendance_status
    if flat_status == "attended":
      st = "morning"
    elif flat_status == "not_attended":
      st = "outside"
    else:
      st = "outside"
    today = datetime.now(ZoneInfo(tz_name)).date().isoformat()
    upsert_checkin_from_import(
      db,
      nickname=item.name,
      checkin_date_local=today,
      status=st,
      tz_name=tz_name,
    )


def _checkin_tz_default() -> str:
  return os.getenv("CHECKIN_TZ", "Asia/Tokyo")


def confirm_attendance_import(
  db: Session, *, import_id: int
) -> Tuple[Optional[AttendanceImport], dict[str, int]]:
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
  db.flush()
  apply_attendance_import_side_effects(db, import_id=import_id)
  db.commit()
  db.refresh(record)
  return record, counts


def list_members(db: Session) -> list[Member]:
  stmt = (
    select(Member)
    .where(Member.is_active.is_(True))
    .order_by(Member.name.asc(), Member.role.asc(), Member.goal.asc())
  )
  return list(db.scalars(stmt).all())


def create_member(db: Session, *, name: str, role: str, goal: str) -> Member:
  trimmed = name.strip()
  role_trimmed = role.strip()
  goal_trimmed = goal.strip()
  if not trimmed or not role_trimmed or not goal_trimmed:
    raise ValueError("name, role and goal are required")

  existing = list(
    db.scalars(
      select(Member)
      .where(
        Member.name == trimmed,
        Member.role == role_trimmed,
        Member.goal == goal_trimmed,
        Member.is_active.is_(True),
      )
      .limit(1)
    ).all()
  )
  if existing:
    return existing[0]

  now = datetime.now(timezone.utc)
  member = Member(created_at=now, name=trimmed, role=role_trimmed, goal=goal_trimmed, is_active=True)
  db.add(member)
  db.commit()
  db.refresh(member)
  return member


def get_active_member_by_id(db: Session, member_id: int) -> Optional[Member]:
  member = db.get(Member, member_id)
  if member is None or not member.is_active:
    return None
  return member


def deactivate_member(db: Session, *, member_id: int) -> None:
  member = db.get(Member, member_id)
  if member is None:
    return
  db.execute(
    update(AchievementBadge)
    .where(AchievementBadge.member_id == member_id)
    .values(member_id=None)
  )
  member.is_active = False
  db.commit()


def get_daily_hero_by_date(db: Session, *, hero_date_local: str) -> Optional[DailyHero]:
  return db.scalar(select(DailyHero).where(DailyHero.hero_date_local == hero_date_local))


def create_daily_hero(
  db: Session,
  *,
  hero_date_local: str,
  theme: str,
  title: str,
  subtitle: str,
  image_filename: str,
  created_at: datetime,
) -> DailyHero:
  row = DailyHero(
    hero_date_local=hero_date_local,
    theme=theme,
    title=title,
    subtitle=subtitle,
    image_filename=image_filename,
    created_at=created_at,
  )
  db.add(row)
  db.commit()
  db.refresh(row)
  return row


def delete_daily_hero(db: Session, *, row: DailyHero) -> None:
  db.delete(row)
  db.commit()


def list_badges(
  db: Session,
  *,
  start_date: Optional[str] = None,
  end_date: Optional[str] = None,
  limit: int = 5000,
) -> list[AchievementBadge]:
  stmt = select(AchievementBadge).order_by(
    AchievementBadge.earned_date_local.desc(), AchievementBadge.id.desc()
  )
  if start_date and end_date:
    stmt = stmt.where(
      and_(
        AchievementBadge.earned_date_local >= start_date,
        AchievementBadge.earned_date_local < end_date,
      )
    )
  elif start_date:
    stmt = stmt.where(AchievementBadge.earned_date_local >= start_date)
  elif end_date:
    stmt = stmt.where(AchievementBadge.earned_date_local < end_date)
  stmt = stmt.limit(limit)
  return list(db.scalars(stmt).all())


def create_badge(
  db: Session,
  *,
  nickname: str,
  title: str,
  earned_date_local: str,
  member_id: Optional[int] = None,
  certificate_image_filename: Optional[str] = None,
) -> AchievementBadge:
  now = datetime.now(timezone.utc)
  row = AchievementBadge(
    created_at=now,
    nickname=nickname.strip(),
    title=title.strip(),
    earned_date_local=earned_date_local.strip(),
    member_id=member_id,
    certificate_image_filename=certificate_image_filename,
  )
  db.add(row)
  db.commit()
  db.refresh(row)
  return row


def update_badge(
  db: Session,
  *,
  badge_id: int,
  nickname: str,
  title: str,
  earned_date_local: str,
  member_id: Optional[int] = None,
) -> Optional[AchievementBadge]:
  row = db.get(AchievementBadge, badge_id)
  if row is None:
    return None
  row.nickname = nickname.strip()
  row.title = title.strip()
  row.earned_date_local = earned_date_local.strip()
  row.member_id = member_id
  db.commit()
  db.refresh(row)
  return row


def update_badge_certificate_filename(
  db: Session, *, badge_id: int, filename: str
) -> Optional[AchievementBadge]:
  row = db.get(AchievementBadge, badge_id)
  if row is None:
    return None
  row.certificate_image_filename = filename
  db.commit()
  db.refresh(row)
  return row


def delete_badge(db: Session, *, badge_id: int) -> bool:
  row = db.get(AchievementBadge, badge_id)
  if row is None:
    return False
  delete_stored_file(row.certificate_image_filename)
  db.delete(row)
  db.commit()
  return True


def list_learning_goals(db: Session) -> list[LearningGoal]:
  stmt = select(LearningGoal).order_by(LearningGoal.id.desc())
  return list(db.scalars(stmt).all())


def create_learning_goal(
  db: Session,
  *,
  name: str,
  progress: int,
  total_units: int,
  complete_units: int,
  start_date: Optional[date],
  deadline: Optional[date],
) -> LearningGoal:
  now = datetime.now(timezone.utc)
  effective_progress = (
    derive_learning_goal_progress(total_units, complete_units)
    if total_units > 0
    else progress
  )
  row = LearningGoal(
    created_at=now,
    name=name.strip(),
    progress=effective_progress,
    total_units=total_units,
    complete_units=complete_units,
    start_date=start_date,
    deadline=deadline,
  )
  db.add(row)
  db.commit()
  db.refresh(row)
  return row


def get_learning_goal(db: Session, *, goal_id: int) -> Optional[LearningGoal]:
  return db.get(LearningGoal, goal_id)


def delete_learning_goal(db: Session, *, goal_id: int) -> bool:
  row = db.get(LearningGoal, goal_id)
  if row is None:
    return False
  db.delete(row)
  db.commit()
  return True

