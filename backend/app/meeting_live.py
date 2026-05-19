"""In-browser meeting via LiveKit SFU: daily room + access tokens."""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from livekit.api import AccessToken, VideoGrants

from . import schemas

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _room_key_for_today() -> str:
  tz_name = os.getenv("CHECKIN_TZ") or "Asia/Tokyo"
  d = datetime.now(ZoneInfo(tz_name)).date().isoformat()
  return f"daily-{d}"


@dataclass
class _RoomState:
  host_client_id: Optional[str] = None
  display_names: dict[str, str] = field(default_factory=dict)


_rooms: dict[str, _RoomState] = {}
_lock = asyncio.Lock()


def _livekit_settings() -> tuple[str, str, str]:
  api_key = os.getenv("LIVEKIT_API_KEY", "").strip()
  api_secret = os.getenv("LIVEKIT_API_SECRET", "").strip()
  public_url = (
    os.getenv("LIVEKIT_PUBLIC_URL", "").strip()
    or os.getenv("LIVEKIT_URL", "").strip()
  )
  if not api_key or not api_secret or not public_url:
    raise HTTPException(
      status_code=503,
      detail=(
        "LiveKit is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, "
        "and LIVEKIT_PUBLIC_URL (browser-reachable WebSocket URL, e.g. ws://localhost:7880)."
      ),
    )
  return api_key, api_secret, public_url


def _issue_livekit_token(*, room_id: str, client_id: str, display_name: str) -> str:
  api_key, api_secret, _ = _livekit_settings()
  return (
    AccessToken(api_key, api_secret)
    .with_identity(client_id)
    .with_name(display_name or client_id)
    .with_grants(VideoGrants(room_join=True, room=room_id))
    .to_jwt()
  )


@router.post("/join", response_model=schemas.MeetingJoinOut)
async def join_meeting(payload: schemas.MeetingJoinIn) -> schemas.MeetingJoinOut:
  client_id = payload.client_id.strip()
  if not client_id or len(client_id) > 120:
    raise HTTPException(status_code=400, detail="client_id is required (max 120 chars)")
  display_name = (payload.display_name or "").strip()[:120]
  room_id = _room_key_for_today()
  async with _lock:
    room = _rooms.setdefault(room_id, _RoomState())
    is_host = room.host_client_id is None
    if is_host:
      room.host_client_id = client_id
    if display_name:
      room.display_names[client_id] = display_name
  _, _, livekit_url = _livekit_settings()
  token = _issue_livekit_token(
    room_id=room_id,
    client_id=client_id,
    display_name=display_name,
  )
  return schemas.MeetingJoinOut(
    room_id=room_id,
    is_host=is_host,
    livekit_url=livekit_url,
    token=token,
  )
