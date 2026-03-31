import json
import os
from pathlib import Path
from typing import TypedDict


class CheckinWindow(TypedDict):
  start: str
  end: str


DEFAULT_WINDOW: CheckinWindow = {"start": "04:30", "end": "08:00"}


def _default_config_path() -> Path:
  # In Docker this resolves to /app/config/checkin_window.json.
  # In local dev this resolves to backend/config/checkin_window.json.
  return Path(__file__).resolve().parent.parent / "config" / "checkin_window.json"


def load_checkin_window_config() -> CheckinWindow:
  config_path = Path(os.getenv("CHECKIN_CONFIG_FILE", str(_default_config_path())))
  try:
    raw = json.loads(config_path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError):
    return DEFAULT_WINDOW.copy()

  start = str(raw.get("start", DEFAULT_WINDOW["start"]))
  end = str(raw.get("end", DEFAULT_WINDOW["end"]))
  return {"start": start, "end": end}
