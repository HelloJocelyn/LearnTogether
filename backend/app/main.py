import os
import logging
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from . import crud, schemas
from .checkin_config import (
  load_checkin_window_config,
  resolve_checkin_config_path,
  save_checkin_window_config,
)
from .daily_hero_service import get_daily_hero_response, get_today_hero_image_path
from .db import get_db, init_db


app = FastAPI(title="LearnTogether API")
logger = logging.getLogger("uvicorn.error")

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
    # Keep it simple without auth; validate non-empty nickname.
    from fastapi import HTTPException

    raise HTTPException(status_code=400, detail="nickname is required")
  tz_name = os.getenv("CHECKIN_TZ")
  window = load_checkin_window_config()
  return crud.create_checkin(
    db,
    nickname=nickname,
    requested_status="leave" if payload.status == "leave" else None,
    tz_name=tz_name,
    normal_start=window["normal_start"],
    normal_end=window["normal_end"],
    late_end=window["late_end"],
  )


@app.get("/api/members", response_model=list[schemas.MemberOut])
def list_members(db: Session = Depends(get_db)):
  return crud.list_members(db)


@app.post("/api/members", response_model=schemas.MemberOut)
def create_member(payload: schemas.MemberCreate, db: Session = Depends(get_db)):
  try:
    return crud.create_member(db, name=payload.name)
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


@app.put("/api/settings/checkin-window", response_model=schemas.CheckinWindowConfigOut)
def update_checkin_window_config(payload: schemas.CheckinWindowConfig):
  try:
    saved = save_checkin_window_config(
      normal_start=payload.normal_start,
      normal_end=payload.normal_end,
      late_end=payload.late_end,
    )
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from exc
  app_env = os.getenv("APP_ENV", "local").strip().lower() or "local"
  source = str(resolve_checkin_config_path())
  return schemas.CheckinWindowConfigOut(**saved, app_env=app_env, source=source)


def _normalize_status(raw: str) -> schemas.AttendanceStatus:
  value = raw.strip().lower()
  if value in {"attended", "present", "yes", "y", "1"}:
    return "attended"
  if value in {"not attended", "absent", "no", "n", "0", "not_attended"}:
    return "not_attended"
  return "unknown"


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

