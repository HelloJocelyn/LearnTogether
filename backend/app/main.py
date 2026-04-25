import csv
import io
import json
import logging
import mimetypes
import os
import re
from datetime import date, datetime, timedelta
from urllib.parse import parse_qs, urlparse
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from . import crud, meeting_live, schemas
from .schemas import attach_learning_goal_pace, derive_learning_goal_progress
from .badge_storage import path_for_stored_filename, save_certificate_image
from .checkin_config import (
  load_checkin_window_config,
  load_daily_hero_settings,
  load_statistics_settings,
  load_zoom_join_settings,
  resolve_checkin_config_path,
  save_checkin_window_config,
  save_daily_hero_settings,
  save_statistics_settings,
  save_zoom_join_settings,
)
from .daily_hero_service import get_daily_hero_response, get_today_hero_image_path
from .db import get_db, init_db
from .models import AchievementBadge


app = FastAPI(title="LearnTogether API")
app.include_router(meeting_live.router)
logger = logging.getLogger("uvicorn.error")


def require_full_edition() -> None:
  edition = os.getenv("APP_EDITION", "lite").strip().lower()
  if edition != "full":
    raise HTTPException(
      status_code=403,
      detail="This endpoint requires Full edition (set APP_EDITION=full on the server).",
    )


_BADGE_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_MATRIX_DATE_CELL = re.compile(r"^\d{1,2}/\d{1,2}$")


def _today_checkin_tz() -> date:
  tz = os.getenv("CHECKIN_TZ") or "Asia/Tokyo"
  return datetime.now(ZoneInfo(tz)).date()


def _merge_zoom_values(meeting_id: str, passcode: str, join_url: str) -> tuple[str, str]:
  """Fill meeting/pass from join URL when missing."""
  mid = meeting_id.strip()
  pw = passcode.strip()
  url = join_url.strip()
  if not url or (mid and pw):
    return mid, pw
  parsed = urlparse(url)
  if not mid:
    segments = [s for s in parsed.path.split("/") if s]
    for seg in reversed(segments):
      digits = "".join(ch for ch in seg if ch.isdigit())
      if len(digits) >= 9:
        mid = digits
        break
  if not pw:
    query = parse_qs(parsed.query)
    pw = (query.get("pwd") or query.get("passcode") or [""])[0].strip()
  return mid, pw


def _parse_optional_member_id(raw: Optional[str]) -> Optional[int]:
  if raw is None or str(raw).strip() == "":
    return None
  try:
    v = int(raw)
  except ValueError as exc:
    raise HTTPException(status_code=400, detail="invalid member_id") from exc
  if v < 1:
    raise HTTPException(status_code=400, detail="invalid member_id")
  return v


def _member_display_name(name: str, role: str, goal: str) -> str:
  return f"{name.strip()} {role.strip()} {goal.strip()}".strip()


# In Docker we proxy via Nginx (no CORS needed). For local dev, this is permissive.
app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.on_event("startup")
def _on_startup() -> None:
  init_db()


@app.get("/api/health")
def health():
  return {"ok": True}


@app.get("/api/daily-hero", response_model=schemas.DailyHeroOut)
def get_daily_hero(db: Session = Depends(get_db)):
  return get_daily_hero_response(db)


@app.get("/api/daily-hero/image")
def get_daily_hero_image(db: Session = Depends(get_db)):
  path = get_today_hero_image_path(db)
  if path is None:
    raise HTTPException(status_code=404, detail="daily hero image not available")
  return FileResponse(path, media_type="image/png")


@app.get("/api/items", response_model=list[schemas.ItemOut])
def list_items(db: Session = Depends(get_db)):
  return crud.list_items(db)


@app.post("/api/items", response_model=schemas.ItemOut)
def create_item(payload: schemas.ItemCreate, db: Session = Depends(get_db)):
  return crud.create_item(db, title=payload.title)


@app.get("/api/checkins", response_model=list[schemas.CheckInOut])
def list_checkins(
  limit: int = 50,
  real_only: bool = False,
  today_only: bool = False,
  start_date: Optional[str] = None,
  end_date: Optional[str] = None,
  db: Session = Depends(get_db),
):
  tz_name = os.getenv("CHECKIN_TZ")
  logger.warning(
    "list_checkins request: limit=%s real_only=%s today_only=%s start_date=%s end_date=%s tz=%s",
    limit,
    real_only,
    today_only,
    start_date,
    end_date,
    tz_name,
  )
  if today_only:
    local_today = (
      datetime.now(ZoneInfo(tz_name)).date() if tz_name else datetime.now().astimezone().date()
    )
    start_date = local_today.isoformat()
    end_date = (local_today + timedelta(days=1)).isoformat()
    rows = crud.list_checkins_range(
      db,
      limit=limit,
      real_only=real_only,
      start_date=start_date,
      end_date=end_date,
      tz_name=tz_name,
    )
    logger.warning(
      "list_checkins today_only resolved: local_today=%s start_date=%s end_date=%s result_count=%s",
      local_today,
      start_date,
      end_date,
      len(rows),
    )
    return rows

  if start_date and end_date:
    rows = crud.list_checkins_range(
      db,
      limit=limit,
      real_only=real_only,
      start_date=start_date,
      end_date=end_date,
      tz_name=tz_name,
    )
    logger.warning(
      "list_checkins range resolved: start_date=%s end_date=%s result_count=%s",
      start_date,
      end_date,
      len(rows),
    )
    return rows

  rows = crud.list_checkins(db, limit=limit, real_only=real_only)
  logger.warning("list_checkins plain resolved: result_count=%s", len(rows))
  return rows


@app.post("/api/checkins", response_model=schemas.CheckInOut)
def create_checkin(payload: schemas.CheckInCreate, db: Session = Depends(get_db)):
  nickname = payload.nickname.strip()
  if not nickname:
    raise HTTPException(status_code=400, detail="nickname is required")
  tz_name = os.getenv("CHECKIN_TZ")
  window = load_checkin_window_config()
  try:
    return crud.create_checkin(
      db,
      nickname=nickname,
      requested_status="leave" if payload.status == "leave" else None,
      tz_name=tz_name,
      morning_start=window["morning_start"],
      morning_end=window["morning_end"],
      night_start=window["night_start"],
      night_end=window["night_end"],
    )
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/checkins/scheduled-leave", response_model=list[schemas.CheckInOut])
def create_scheduled_leave(payload: schemas.ScheduledLeaveCreate, db: Session = Depends(get_db)):
  nickname = payload.nickname.strip()
  if not nickname:
    raise HTTPException(status_code=400, detail="nickname is required")
  tz_name = os.getenv("CHECKIN_TZ")
  try:
    return crud.create_scheduled_leave_period(
      db,
      nickname=nickname,
      leave_start_date_local=payload.leave_start_date_local.strip(),
      leave_end_date_local=payload.leave_end_date_local.strip(),
      tz_name=tz_name,
    )
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.put("/api/checkins/attendance-cell", response_model=list[schemas.CheckInOut])
def put_attendance_cell(payload: schemas.AttendanceCellUpsert, db: Session = Depends(get_db)):
  try:
    return crud.upsert_attendance_cell(
      db,
      nickname=payload.nickname,
      checkin_date_local=payload.checkin_date_local,
      status=payload.status,
    )
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/members", response_model=list[schemas.MemberOut])
def list_members(db: Session = Depends(get_db)):
  return crud.list_members(db)


@app.post("/api/members", response_model=schemas.MemberOut)
def create_member(payload: schemas.MemberCreate, db: Session = Depends(get_db)):
  try:
    return crud.create_member(db, name=payload.name, role=payload.role, goal=payload.goal)
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/members/{member_id}", status_code=204)
def delete_member(member_id: int, db: Session = Depends(get_db)):
  crud.deactivate_member(db, member_id=member_id)


@app.get("/api/settings/checkin-window", response_model=schemas.CheckinWindowConfigOut)
def get_checkin_window_config():
  window = load_checkin_window_config()
  app_env = os.getenv("APP_ENV", "local").strip().lower() or "local"
  source = str(resolve_checkin_config_path())
  return schemas.CheckinWindowConfigOut(**window, app_env=app_env, source=source)


@app.get("/api/settings/statistics", response_model=schemas.StatisticsSettingsOut)
def get_statistics_settings():
  return schemas.StatisticsSettingsOut(**load_statistics_settings())


@app.put("/api/settings/statistics", response_model=schemas.StatisticsSettingsOut)
def update_statistics_settings(payload: schemas.StatisticsSettingsIn):
  try:
    saved = save_statistics_settings(weekly_no_checkin_threshold=payload.weekly_no_checkin_threshold)
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc
  return schemas.StatisticsSettingsOut(**saved)


@app.get("/api/settings/daily-hero", response_model=schemas.DailyHeroSettingsOut)
def get_daily_hero_settings():
  return schemas.DailyHeroSettingsOut(**load_daily_hero_settings())


@app.put("/api/settings/daily-hero", response_model=schemas.DailyHeroSettingsOut)
def update_daily_hero_settings(payload: schemas.DailyHeroSettingsIn):
  save_daily_hero_settings(daily_hero_openai_api_key=payload.daily_hero_openai_api_key)
  return schemas.DailyHeroSettingsOut(**load_daily_hero_settings())


@app.get("/api/settings/zoom-join", response_model=schemas.ZoomJoinHintsOut)
def get_zoom_join_hints():
  """Manual Zoom join info from config, with env override."""
  saved = load_zoom_join_settings()
  env_mid = os.getenv("ZOOM_MEETING_ID", "").strip()
  env_pw = os.getenv("ZOOM_PASSCODE", "").strip()
  env_url = os.getenv("ZOOM_JOIN_URL", "").strip()
  join_url = env_url or saved["join_url"]
  mid, pw = _merge_zoom_values(env_mid or saved["meeting_id"], env_pw or saved["passcode"], join_url)
  return schemas.ZoomJoinHintsOut(meeting_id=mid or None, passcode=pw or None, join_url=join_url or None)


@app.get("/api/badges", response_model=list[schemas.AchievementBadgeOut])
def list_badges(
  start_date: Optional[str] = None,
  end_date: Optional[str] = None,
  limit: int = 5000,
  db: Session = Depends(get_db),
):
  rows = crud.list_badges(db, start_date=start_date, end_date=end_date, limit=limit)
  return [schemas.achievement_badge_to_out(r) for r in rows]


@app.post("/api/badges", response_model=schemas.AchievementBadgeOut)
async def create_badge(
  title: str = Form(...),
  earned_date: str = Form(...),
  nickname: str = Form(""),
  member_id: Optional[str] = Form(None),
  certificate: Optional[UploadFile] = File(None),
  db: Session = Depends(get_db),
):
  title_clean = title.strip()
  earned = earned_date.strip()
  if not title_clean or not _BADGE_DATE.match(earned):
    raise HTTPException(status_code=400, detail="invalid title or earned_date (use YYYY-MM-DD)")

  mid = _parse_optional_member_id(member_id)
  resolved_member_id: Optional[int] = None
  resolved_nickname = ""
  if mid is not None:
    member = crud.get_active_member_by_id(db, mid)
    if member is None:
      raise HTTPException(status_code=400, detail="member not found or inactive")
    resolved_nickname = _member_display_name(member.name, member.role, member.goal)
    resolved_member_id = member.id
  else:
    resolved_nickname = nickname.strip()
    if not resolved_nickname:
      raise HTTPException(status_code=400, detail="nickname is required when member is not linked")

  row = crud.create_badge(
    db,
    nickname=resolved_nickname,
    title=title_clean,
    earned_date_local=earned,
    member_id=resolved_member_id,
  )

  if certificate and certificate.filename:
    try:
      data = await certificate.read()
      if not data:
        raise ValueError("certificate image is empty")
      fname = save_certificate_image(
        badge_id=row.id, content_type=certificate.content_type, data=data
      )
      updated = crud.update_badge_certificate_filename(db, badge_id=row.id, filename=fname)
      if updated is None:
        raise RuntimeError("badge row missing after save")
      row = updated
    except ValueError as exc:
      crud.delete_badge(db, badge_id=row.id)
      raise HTTPException(status_code=400, detail=str(exc)) from exc

  return schemas.achievement_badge_to_out(row)


@app.put("/api/badges/{badge_id}", response_model=schemas.AchievementBadgeOut)
async def update_badge(
  badge_id: int,
  title: str = Form(...),
  earned_date: str = Form(...),
  nickname: str = Form(""),
  member_id: Optional[str] = Form(None),
  certificate: Optional[UploadFile] = File(None),
  db: Session = Depends(get_db),
):
  title_clean = title.strip()
  earned = earned_date.strip()
  if not title_clean or not _BADGE_DATE.match(earned):
    raise HTTPException(status_code=400, detail="invalid title or earned_date (use YYYY-MM-DD)")

  mid = _parse_optional_member_id(member_id)
  resolved_member_id: Optional[int] = None
  resolved_nickname = ""
  if mid is not None:
    member = crud.get_active_member_by_id(db, mid)
    if member is None:
      raise HTTPException(status_code=400, detail="member not found or inactive")
    resolved_nickname = _member_display_name(member.name, member.role, member.goal)
    resolved_member_id = member.id
  else:
    resolved_nickname = nickname.strip()
    if not resolved_nickname:
      raise HTTPException(status_code=400, detail="nickname is required when member is not linked")

  row = crud.update_badge(
    db,
    badge_id=badge_id,
    nickname=resolved_nickname,
    title=title_clean,
    earned_date_local=earned,
    member_id=resolved_member_id,
  )
  if row is None:
    raise HTTPException(status_code=404, detail="badge not found")

  if certificate and certificate.filename:
    data = await certificate.read()
    if not data:
      raise HTTPException(status_code=400, detail="certificate image is empty")
    try:
      fname = save_certificate_image(badge_id=row.id, content_type=certificate.content_type, data=data)
    except ValueError as exc:
      raise HTTPException(status_code=400, detail=str(exc)) from exc
    updated = crud.update_badge_certificate_filename(db, badge_id=row.id, filename=fname)
    if updated is not None:
      row = updated

  return schemas.achievement_badge_to_out(row)


@app.get("/api/badges/{badge_id}/certificate")
def get_badge_certificate(badge_id: int, db: Session = Depends(get_db)):
  row = db.get(AchievementBadge, badge_id)
  if row is None or not row.certificate_image_filename:
    raise HTTPException(status_code=404, detail="certificate image not found")
  path = path_for_stored_filename(row.certificate_image_filename)
  if not path.is_file():
    raise HTTPException(status_code=404, detail="certificate file missing")
  mt = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
  return FileResponse(path, media_type=mt)


@app.delete("/api/badges/{badge_id}", status_code=204)
def delete_badge(badge_id: int, db: Session = Depends(get_db)):
  if not crud.delete_badge(db, badge_id=badge_id):
    raise HTTPException(status_code=404, detail="badge not found")


@app.put("/api/settings/checkin-window", response_model=schemas.CheckinWindowConfigOut)
def update_checkin_window_config(payload: schemas.CheckinWindowConfig):
  try:
    saved = save_checkin_window_config(
      morning_start=payload.morning_start,
      morning_end=payload.morning_end,
      night_start=payload.night_start,
      night_end=payload.night_end,
    )
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc
  app_env = os.getenv("APP_ENV", "local").strip().lower() or "local"
  source = str(resolve_checkin_config_path())
  return schemas.CheckinWindowConfigOut(**saved, app_env=app_env, source=source)


@app.put("/api/settings/zoom-join", response_model=schemas.ZoomJoinHintsOut)
def update_zoom_join_hints(payload: schemas.ZoomJoinHintsIn):
  saved = save_zoom_join_settings(
    meeting_id=payload.meeting_id or "",
    passcode=payload.passcode or "",
    join_url=payload.join_url or "",
  )
  mid, pw = _merge_zoom_values(saved["meeting_id"], saved["passcode"], saved["join_url"])
  return schemas.ZoomJoinHintsOut(
    meeting_id=mid or None,
    passcode=pw or None,
    join_url=saved["join_url"] or None,
  )


def _normalize_status(raw: str) -> schemas.AttendanceStatus:
  trimmed = raw.strip()
  value = trimmed.lower()
  if value in {"attended", "present", "yes", "y", "1"}:
    return "attended"
  if value in {"not attended", "absent", "no", "n", "0", "not_attended"}:
    return "not_attended"
  if trimmed in {"出席", "到", "参加"}:
    return "attended"
  if trimmed in {"缺席", "缺", "未出席"}:
    return "not_attended"
  return "unknown"


def _decode_csv_bytes(content: bytes) -> str:
  for enc in ("utf-8-sig", "utf-8", "gbk", "gb2312"):
    try:
      return content.decode(enc)
    except UnicodeDecodeError:
      continue
  raise ValueError("Could not decode CSV (try UTF-8 or GBK)")


def _csv_row_looks_like_header(row: list[str]) -> bool:
  for c in row:
    cl = c.strip()
    if not cl:
      continue
    low = cl.lower()
    if low in {"name", "nickname", "status", "attendance", "state"}:
      return True
    if cl in {"姓名", "名字", "出席", "状态"}:
      return True
  return False


def _csv_find_name_column(header_row: list[str]) -> int:
  for i, c in enumerate(header_row):
    cl = c.strip()
    low = cl.lower()
    if low in {"name", "nickname"} or cl in {"姓名", "名字"}:
      return i
  return 0


def _csv_find_status_column(header_row: list[str]) -> Optional[int]:
  for i, c in enumerate(header_row):
    cl = c.strip()
    low = cl.lower()
    if low in {"status", "attendance", "state"} or cl in {"出席", "状态"}:
      return i
  return None


def _looks_like_early_session_matrix(rows: list[list[str]]) -> bool:
  for row in rows[:40]:
    if len(row) >= 2 and row[0].strip() == "番号" and row[1].strip() == "姓名":
      return True
  return False


def _find_matrix_header_row(rows: list[list[str]]) -> Optional[int]:
  for i, row in enumerate(rows):
    if len(row) >= 2 and row[0].strip() == "番号" and row[1].strip() == "姓名":
      return i
  return None


def _matrix_mark_bucket(cell: str) -> str:
  s = cell.strip()
  if not s:
    return "empty"
  if "√" in s or s in {"✓"}:
    return "check"
  if "迟" in s:
    return "late"
  if "请" in s:
    return "leave"
  return "other"


def _aggregate_matrix_row_status(counts: dict[str, int]) -> schemas.AttendanceStatus:
  check = counts.get("check", 0)
  late = counts.get("late", 0)
  leave = counts.get("leave", 0)
  present = check + late
  if present == 0 and leave == 0:
    return "unknown"
  if leave > present:
    return "not_attended"
  return "attended"


def _parse_sheet_period_year_month(sheet_title: str) -> tuple[int, int]:
  m = re.search(r"(\d{4})\s*年\s*(\d{1,2})\s*月", sheet_title or "")
  if m:
    return int(m.group(1)), int(m.group(2))
  tz_name = os.getenv("CHECKIN_TZ", "Asia/Tokyo")
  local_now = datetime.now(ZoneInfo(tz_name))
  return local_now.year, local_now.month


def _parse_early_session_matrix(all_rows: list[list[str]], raw_text: str) -> tuple[str, list[dict[str, object]]]:
  hi = _find_matrix_header_row(all_rows)
  if hi is None:
    raise ValueError("Missing 番号 / 姓名 header row")

  header_row = all_rows[hi]
  attendance_col_idx: Optional[int] = None
  notes_col_idx: Optional[int] = None
  for j, c in enumerate(header_row):
    t = c.strip()
    if t == "出勤天数":
      attendance_col_idx = j
    elif t in {"备考", "备注"}:
      notes_col_idx = j

  if attendance_col_idx is not None and attendance_col_idx > 2:
    num_pairs = (attendance_col_idx - 2) // 2
  else:
    num_pairs = 0
    col = 2
    while col + 1 < len(header_row):
      lab = header_row[col].strip()
      if _MATRIX_DATE_CELL.match(lab):
        num_pairs += 1
        col += 2
      else:
        break

  if num_pairs <= 0:
    raise ValueError("Could not detect day columns (expected headers like 4/1, 4/2, …)")

  if notes_col_idx is None and attendance_col_idx is not None:
    notes_col_idx = attendance_col_idx + 1

  day_labels: list[str] = []
  for k in range(num_pairs):
    idx = 2 + 2 * k
    lab = header_row[idx].strip() if idx < len(header_row) else ""
    day_labels.append(lab if lab else f"day{k + 1}")

  sheet_title = ""
  if hi > 0 and all_rows[0]:
    sheet_title = all_rows[0][0].strip()

  period_year, period_month = _parse_sheet_period_year_month(sheet_title)

  items: list[dict[str, object]] = []
  for row in all_rows[hi + 2 :]:
    if not row or not any(x.strip() for x in row):
      continue
    if row[0].strip().startswith("说明"):
      break
    if len(row) < 2:
      continue
    name = row[1].strip()
    if not name:
      continue

    roll_raw = row[0].strip()
    roll_num: Optional[int] = int(roll_raw) if roll_raw.isdigit() else None

    counts = {"check": 0, "late": 0, "leave": 0, "other": 0, "empty": 0}
    daily: list[dict[str, str]] = []
    for k in range(num_pairs):
      sc = 2 + 2 * k
      tc = 3 + 2 * k
      mark_cell = row[sc].strip() if sc < len(row) else ""
      time_cell = row[tc].strip() if tc < len(row) else ""
      bucket = _matrix_mark_bucket(mark_cell)
      if bucket == "empty" and not time_cell:
        counts["empty"] += 1
      elif bucket == "check":
        counts["check"] += 1
      elif bucket == "late":
        counts["late"] += 1
      elif bucket == "leave":
        counts["leave"] += 1
      else:
        counts["other"] += 1
      if mark_cell or time_cell:
        daily.append(
          {
            "date": day_labels[k] if k < len(day_labels) else str(k + 1),
            "status": mark_cell,
            "time": time_cell,
          }
        )

    agg = _aggregate_matrix_row_status(counts)

    days_present_cell = ""
    if attendance_col_idx is not None and attendance_col_idx < len(row):
      days_present_cell = row[attendance_col_idx].strip()

    notes_cell = ""
    if notes_col_idx is not None and notes_col_idx < len(row):
      notes_cell = row[notes_col_idx].strip()

    reported_days: Optional[int] = None
    if days_present_cell.isdigit():
      reported_days = int(days_present_cell)

    detail = {
      "format": "early_session_matrix_v1",
      "sheet_title": sheet_title,
      "period_year": period_year,
      "period_month": period_month,
      "day_labels": day_labels,
      "counts": counts,
      "days_present_reported": reported_days,
      "days_present_cell": days_present_cell,
      "daily": daily,
    }

    items.append(
      {
        "name": name,
        "attendance_status": agg,
        "confidence": 100,
        "roll_number": roll_num,
        "notes": notes_cell or None,
        "detail_json": json.dumps(detail, ensure_ascii=False),
      }
    )

  if not items:
    raise ValueError("No participant rows found under the matrix header")

  return raw_text, items


def _parse_csv_attendance(content: bytes) -> tuple[str, list[dict[str, object]]]:
  text = _decode_csv_bytes(content)
  lines = text.splitlines()
  if not lines:
    raise ValueError("CSV is empty")

  sample = "\n".join(lines[: min(12, len(lines))])
  try:
    dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
  except csv.Error:
    dialect = csv.excel

  reader = csv.reader(io.StringIO(text), dialect)
  all_rows = [[cell.strip() for cell in row] for row in reader]

  if _looks_like_early_session_matrix(all_rows):
    return _parse_early_session_matrix(all_rows, text)

  parsed_rows = [r for r in all_rows if any(cell for cell in r)]
  if not parsed_rows:
    raise ValueError("No data rows in CSV")

  first = parsed_rows[0]
  header = _csv_row_looks_like_header(first)
  if header:
    name_idx = _csv_find_name_column(first)
    status_idx = _csv_find_status_column(first)
    if status_idx is None and len(first) >= 2:
      status_idx = next((i for i in range(len(first)) if i != name_idx), None)
    body_rows = parsed_rows[1:]
  else:
    name_idx = 0
    status_idx = 1 if len(first) > 1 else None
    body_rows = parsed_rows

  items: list[dict[str, object]] = []
  for row in body_rows:
    raw_name = row[name_idx].strip() if name_idx < len(row) else ""
    if not raw_name:
      continue
    status_raw = ""
    if status_idx is not None and status_idx < len(row):
      status_raw = row[status_idx].strip()
    status = _normalize_status(status_raw) if status_raw else "unknown"
    items.append(
      {
        "name": raw_name,
        "attendance_status": status,
        "confidence": 100,
      }
    )

  if not items:
    raise ValueError("No data rows with a non-empty name")

  return text, items


def _fake_ocr_items_from_filename(filename: str) -> tuple[str, list[dict[str, object]]]:
  # Placeholder OCR output until real OCR integration is ready.
  lower_name = filename.lower()
  if "sample2" in lower_name:
    lines = [
      "bob: attended",
      "brenda - absent",
      "charlie attended",
      "dora: ???",
    ]
  else:
    lines = [
      "alice: attended",
      "alex: not attended",
      "amy - present",
      "tom not attended",
    ]

  items: list[dict[str, object]] = []
  for line in lines:
    normalized = line.strip()
    if not normalized:
      continue
    if ":" in normalized:
      left, right = normalized.split(":", 1)
    elif "-" in normalized:
      left, right = normalized.split("-", 1)
    else:
      parts = normalized.split()
      left = parts[0] if parts else ""
      right = " ".join(parts[1:]) if len(parts) > 1 else ""

    name = left.strip()
    status = _normalize_status(right)
    items.append(
      {
        "name": name or "unknown",
        "attendance_status": status,
        "confidence": 92 if status != "unknown" else 45,
      }
    )
  return "\n".join(lines), items


@app.post("/api/attendance-imports/ocr", response_model=schemas.AttendanceImportOcrOut)
async def create_attendance_import_from_ocr(
  image: UploadFile = File(...), db: Session = Depends(get_db)
):
  if not image.filename:
    raise HTTPException(status_code=400, detail="image filename is required")

  # Read bytes to validate "upload happened"; OCR is mocked for now.
  content = await image.read()
  if not content:
    raise HTTPException(status_code=400, detail="image is empty")

  raw_text, parsed_items = _fake_ocr_items_from_filename(image.filename)
  record, items = crud.create_attendance_import(
    db, source_filename=image.filename, ocr_raw_text=raw_text, items=parsed_items
  )
  return schemas.AttendanceImportOcrOut(import_info=record, items=items)


@app.post("/api/attendance-imports/csv", response_model=schemas.AttendanceImportOcrOut)
async def create_attendance_import_from_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
  if not file.filename:
    raise HTTPException(status_code=400, detail="filename is required")

  content = await file.read()
  if not content:
    raise HTTPException(status_code=400, detail="file is empty")

  try:
    raw_text, parsed_items = _parse_csv_attendance(content)
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc

  record, items = crud.create_attendance_import(
    db,
    source_filename=file.filename or "upload.csv",
    ocr_raw_text=raw_text,
    items=parsed_items,
  )
  return schemas.AttendanceImportOcrOut(import_info=record, items=items)


@app.get("/api/attendance-imports/{import_id}", response_model=schemas.AttendanceImportDetailOut)
def get_attendance_import(import_id: int, db: Session = Depends(get_db)):
  record, items = crud.get_attendance_import(db, import_id=import_id)
  if record is None:
    raise HTTPException(status_code=404, detail="attendance import not found")
  return schemas.AttendanceImportDetailOut(import_info=record, items=items)


@app.put(
  "/api/attendance-imports/{import_id}/items",
  response_model=list[schemas.AttendanceImportItemOut],
)
def update_attendance_import_items(
  import_id: int,
  payload: list[schemas.AttendanceImportItemUpdate],
  db: Session = Depends(get_db),
):
  record, _ = crud.get_attendance_import(db, import_id=import_id)
  if record is None:
    raise HTTPException(status_code=404, detail="attendance import not found")
  if record.status != "draft":
    raise HTTPException(status_code=400, detail="only draft imports can be updated")

  rows = [{"id": p.id, "name": p.name, "attendance_status": p.attendance_status} for p in payload]
  return crud.update_attendance_import_items(db, import_id=import_id, items=rows)


@app.post(
  "/api/attendance-imports/{import_id}/confirm",
  response_model=schemas.AttendanceImportConfirmOut,
)
def confirm_attendance_import(import_id: int, db: Session = Depends(get_db)):
  record, counts = crud.confirm_attendance_import(db, import_id=import_id)
  if record is None:
    raise HTTPException(status_code=404, detail="attendance import not found")
  return schemas.AttendanceImportConfirmOut(import_id=record.id, status=record.status, **counts)


@app.get("/api/learning-goals", response_model=list[schemas.LearningGoalOut])
def list_learning_goals_api(db: Session = Depends(get_db), _: None = Depends(require_full_edition)):
  today = _today_checkin_tz()
  rows = crud.list_learning_goals(db)
  return [
    attach_learning_goal_pace(schemas.LearningGoalOut.model_validate(r), today=today) for r in rows
  ]


@app.post("/api/learning-goals", response_model=schemas.LearningGoalOut)
def create_learning_goal_api(
  payload: schemas.LearningGoalCreate, db: Session = Depends(get_db), _: None = Depends(require_full_edition)
):
  row = crud.create_learning_goal(
    db,
    name=payload.name,
    progress=payload.progress,
    total_units=payload.total_units,
    complete_units=payload.complete_units,
    start_date=payload.start_date,
    deadline=payload.deadline,
  )
  today = _today_checkin_tz()
  return attach_learning_goal_pace(schemas.LearningGoalOut.model_validate(row), today=today)


@app.patch("/api/learning-goals/{goal_id}", response_model=schemas.LearningGoalOut)
def patch_learning_goal(
  goal_id: int,
  payload: schemas.LearningGoalUpdate,
  db: Session = Depends(get_db),
  _: None = Depends(require_full_edition),
):
  row = crud.get_learning_goal(db, goal_id=goal_id)
  if row is None:
    raise HTTPException(status_code=404, detail="learning goal not found")
  data = payload.model_dump(exclude_unset=True)
  if "name" in data:
    row.name = str(data["name"]).strip()
  if "progress" in data:
    row.progress = int(data["progress"])
  if "total_units" in data:
    row.total_units = int(data["total_units"])
  if "complete_units" in data:
    row.complete_units = int(data["complete_units"])
  if "start_date" in data:
    row.start_date = data["start_date"]
  if "deadline" in data:
    row.deadline = data["deadline"]
  total_u = row.total_units
  complete_u = row.complete_units
  if total_u > 0 and complete_u > total_u:
    raise HTTPException(status_code=400, detail="complete_units cannot exceed total_units")
  if row.start_date is not None and row.deadline is not None and row.start_date > row.deadline:
    raise HTTPException(status_code=400, detail="start_date cannot be after deadline")
  if row.total_units > 0:
    row.progress = derive_learning_goal_progress(row.total_units, row.complete_units)
  db.commit()
  db.refresh(row)
  today = _today_checkin_tz()
  return attach_learning_goal_pace(schemas.LearningGoalOut.model_validate(row), today=today)


@app.delete("/api/learning-goals/{goal_id}")
def delete_learning_goal_api(
  goal_id: int, db: Session = Depends(get_db), _: None = Depends(require_full_edition)
):
  ok = crud.delete_learning_goal(db, goal_id=goal_id)
  if not ok:
    raise HTTPException(status_code=404, detail="learning goal not found")
  return {"ok": True}

