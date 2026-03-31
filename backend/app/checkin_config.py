import json
import os
import re
from pathlib import Path
from typing import TypedDict


class CheckinWindow(TypedDict):
  start: str
  end: str


DEFAULT_WINDOW: CheckinWindow = {"start": "04:30", "end": "08:00"}


def _default_config_path() -> Path:
  base = Path(__file__).resolve().parent.parent / "config"
  app_env = os.getenv("APP_ENV", "local").strip().lower()
  if app_env == "production":
    return base / "checkin_window.production.json"
  return base / "checkin_window.local.json"


def resolve_checkin_config_path() -> Path:
  return Path(os.getenv("CHECKIN_CONFIG_FILE", str(_default_config_path())))


def load_checkin_window_config() -> CheckinWindow:
  config_path = resolve_checkin_config_path()
  try:
    raw = json.loads(config_path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError):
    return DEFAULT_WINDOW.copy()

  start = str(raw.get("start", DEFAULT_WINDOW["start"]))
  end = str(raw.get("end", DEFAULT_WINDOW["end"]))
  return {"start": start, "end": end}


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


def save_checkin_window_config(*, start: str, end: str) -> CheckinWindow:
  checked_start = _validate_hhmm(start, "start")
  checked_end = _validate_hhmm(end, "end")
  config_path = resolve_checkin_config_path()
  config_path.parent.mkdir(parents=True, exist_ok=True)
  payload = {"start": checked_start, "end": checked_end}
  config_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
  return payload
