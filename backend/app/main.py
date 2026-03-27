import os
from typing import Optional

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import crud, schemas
from .db import get_db, init_db


app = FastAPI(title="LearnTogether API")

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
  start_date: Optional[str] = None,
  end_date: Optional[str] = None,
  db: Session = Depends(get_db),
):
  tz_name = os.getenv("CHECKIN_TZ")
  if start_date and end_date:
    return crud.list_checkins_range(
      db,
      limit=limit,
      real_only=real_only,
      start_date=start_date,
      end_date=end_date,
      tz_name=tz_name,
    )

  return crud.list_checkins(db, limit=limit, real_only=real_only)


@app.post("/api/checkins", response_model=schemas.CheckInOut)
def create_checkin(payload: schemas.CheckInCreate, db: Session = Depends(get_db)):
  nickname = payload.nickname.strip()
  if not nickname:
    # Keep it simple without auth; validate non-empty nickname.
    from fastapi import HTTPException

    raise HTTPException(status_code=400, detail="nickname is required")
  tz_name = os.getenv("CHECKIN_TZ")
  return crud.create_checkin(db, nickname=nickname, tz_name=tz_name)

