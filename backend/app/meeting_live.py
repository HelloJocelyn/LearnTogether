"""In-browser WebRTC meeting: room + WebSocket signaling (mesh-ready; swap for SFU signaling later)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

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
  sockets: dict[str, WebSocket] = field(default_factory=dict)
  display_names: dict[str, str] = field(default_factory=dict)


_rooms: dict[str, _RoomState] = {}
_lock = asyncio.Lock()


def _default_ice_servers() -> list[dict[str, Any]]:
  raw = os.getenv("WEBRTC_ICE_SERVERS_JSON", "").strip()
  if raw:
    try:
      parsed = json.loads(raw)
      if isinstance(parsed, list):
        return parsed
    except json.JSONDecodeError:
      logger.warning("WEBRTC_ICE_SERVERS_JSON invalid JSON; using STUN fallback")
  return [{"urls": "stun:stun.l.google.com:19302"}]


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
  return schemas.MeetingJoinOut(
    room_id=room_id,
    is_host=is_host,
    ice_servers=_default_ice_servers(),
  )


async def _broadcast(room_id: str, message: dict, exclude: Optional[str] = None) -> None:
  room = _rooms.get(room_id)
  if not room:
    return
  dead: list[str] = []
  text = json.dumps(message)
  for cid, ws in list(room.sockets.items()):
    if exclude and cid == exclude:
      continue
    try:
      await ws.send_text(text)
    except Exception:
      dead.append(cid)
  for cid in dead:
    room.sockets.pop(cid, None)


@router.websocket("/ws/{room_id}")
async def meeting_websocket(websocket: WebSocket, room_id: str) -> None:
  client_id = (websocket.query_params.get("client_id") or "").strip()
  if not client_id or len(client_id) > 120:
    await websocket.close(code=4400)
    return
  await websocket.accept()
  async with _lock:
    room = _rooms.setdefault(room_id, _RoomState())
    if room.host_client_id is None:
      room.host_client_id = client_id
    room.sockets[client_id] = websocket
    host_id = room.host_client_id
    roster = list(room.sockets.keys())
    names = {k: room.display_names.get(k, k) for k in roster}
  await websocket.send_text(
    json.dumps(
      {
        "type": "welcome",
        "client_id": client_id,
        "is_host": client_id == host_id,
        "roster": roster,
        "display_names": names,
      }
    )
  )
  await _broadcast(
    room_id,
    {"type": "peer-joined", "client_id": client_id, "roster": roster, "display_names": names},
    exclude=client_id,
  )

  try:
    while True:
      raw = await websocket.receive_text()
      try:
        msg = json.loads(raw)
      except json.JSONDecodeError:
        continue
      if not isinstance(msg, dict):
        continue
      mtype = msg.get("type")
      if mtype == "signal":
        target = msg.get("to")
        payload = msg.get("payload")
        if target:
          room = _rooms.get(room_id)
          if not room:
            continue
          peer = room.sockets.get(str(target))
          if peer:
            try:
              await peer.send_text(
                json.dumps({"type": "signal", "from": client_id, "payload": payload})
              )
            except Exception:
              pass
        else:
          await _broadcast(
            room_id,
            {"type": "signal", "from": client_id, "payload": payload},
            exclude=client_id,
          )
  except WebSocketDisconnect:
    pass
  finally:
    async with _lock:
      room = _rooms.get(room_id)
      if not room:
        return
      room.sockets.pop(client_id, None)
      roster = list(room.sockets.keys())
      if not roster:
        _rooms.pop(room_id, None)
      elif room.host_client_id == client_id and roster:
        room.host_client_id = roster[0]
    await _broadcast(
      room_id,
      {"type": "peer-left", "client_id": client_id, "roster": roster},
    )
