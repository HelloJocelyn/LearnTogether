import json
import os
import re
from pathlib import Path
from typing import TypedDict


class CheckinWindow(TypedDict):
  morning_start: str
  morning_end: str
  night_start: str
  night_end: str


class ZoomJoinSettings(TypedDict):
  meeting_id: str
  passcode: str
  join_url: str


DEFAULT_WINDOW: CheckinWindow = {
  "morning_start": "05:00",
  "morning_end": "08:00",
  "night_start": "19:00",
  "night_end": "23:00",
}


DEFAULT_ZOOM_JOIN: ZoomJoinSettings = {
  "meeting_id": "",
  "passcode": "",
  "join_url": "",
}


def _default_config_path() -> Path:
  base = Path(__file__).resolve().parent.parent / "config"
  app_env = os.getenv("APP_ENV", "local").strip().lower()
  if app_env == "production":
    return base / "checkin_window.production.json"
  return base / "checkin_window.local.json"


def resolve_checkin_config_path() -> Path:
  return Path(os.getenv("CHECKIN_CONFIG_FILE", str(_default_config_path())))


def _read_raw_config(config_path: Path) -> dict:
  try:
    raw = json.loads(config_path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError):
    return {}
  if not isinstance(raw, dict):
    return {}
  return raw


def _write_raw_config(config_path: Path, payload: dict) -> None:
  config_path.parent.mkdir(parents=True, exist_ok=True)
  config_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


def load_checkin_window_config() -> CheckinWindow:
  config_path = resolve_checkin_config_path()
  raw = _read_raw_config(config_path)
  if not raw:
    return DEFAULT_WINDOW.copy()

  if raw.get("morning_start") and raw.get("morning_end") and raw.get("night_start") and raw.get("night_end"):
    return {
      "morning_start": str(raw["morning_start"]),
      "morning_end": str(raw["morning_end"]),
      "night_start": str(raw["night_start"]),
      "night_end": str(raw["night_end"]),
    }

  # Legacy single-track window (normal_start / normal_end / late_end).
  start_fallback = str(raw.get("normal_start", raw.get("start", DEFAULT_WINDOW["morning_start"])))
  end_morning = str(raw.get("late_end", raw.get("end", DEFAULT_WINDOW["morning_end"])))
  return {
    "morning_start": start_fallback,
    "morning_end": end_morning,
    "night_start": str(raw.get("night_start", DEFAULT_WINDOW["night_start"])),
    "night_end": str(raw.get("night_end", DEFAULT_WINDOW["night_end"])),
  }


def _validate_hhmm(value: str, field_name: str) -> str:
  v = value.strip()
  m = re.match(r"^(\d{2}):(\d{2})$", v)
  if not m:
    raise ValueError(f"{field_name} must be HH:MM format")
  hh = int(m.group(1))
  mm = int(m.group(2))
  if hh < 0 or hh > 23 or mm < 0 or mm > 59:
    raise ValueError(f"{field_name} must be a valid time")
  return v


def save_checkin_window_config(
  *,
  morning_start: str,
  morning_end: str,
  night_start: str,
  night_end: str,
) -> CheckinWindow:
  ms = _validate_hhmm(morning_start, "morning_start")
  me = _validate_hhmm(morning_end, "morning_end")
  ns = _validate_hhmm(night_start, "night_start")
  ne = _validate_hhmm(night_end, "night_end")
  if not (ms < me):
    raise ValueError("must satisfy morning_start < morning_end")
  if not (ns < ne):
    raise ValueError("must satisfy night_start < night_end")
  config_path = resolve_checkin_config_path()
  raw = _read_raw_config(config_path)
  payload = {
    "morning_start": ms,
    "morning_end": me,
    "night_start": ns,
    "night_end": ne,
  }
  raw.update(payload)
  _write_raw_config(config_path, raw)
  return payload


def load_zoom_join_settings() -> ZoomJoinSettings:
  raw = _read_raw_config(resolve_checkin_config_path())
  return {
    "meeting_id": str(raw.get("zoom_meeting_id", DEFAULT_ZOOM_JOIN["meeting_id"])).strip(),
    "passcode": str(raw.get("zoom_passcode", DEFAULT_ZOOM_JOIN["passcode"])).strip(),
    "join_url": str(raw.get("zoom_join_url", DEFAULT_ZOOM_JOIN["join_url"])).strip(),
  }


def save_zoom_join_settings(*, meeting_id: str, passcode: str, join_url: str) -> ZoomJoinSettings:
  config_path = resolve_checkin_config_path()
  raw = _read_raw_config(config_path)
  payload = {
    "zoom_meeting_id": meeting_id.strip(),
    "zoom_passcode": passcode.strip(),
    "zoom_join_url": join_url.strip(),
  }
  raw.update(payload)
  _write_raw_config(config_path, raw)
  return {
    "meeting_id": payload["zoom_meeting_id"],
    "passcode": payload["zoom_passcode"],
    "join_url": payload["zoom_join_url"],
  }
