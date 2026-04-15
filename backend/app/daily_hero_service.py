import base64
import json
import logging
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import crud, schemas

logger = logging.getLogger("uvicorn.error")

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
DAILY_HERO_DIR = Path(os.getenv("DAILY_HERO_DIR", str(_BACKEND_ROOT / "data" / "daily_hero")))

_THEMES = [
  "Quiet library at dawn, soft paper and ink",
  "Studying by a rainy window, tea and notes",
  "Campus path under cherry trees, gentle focus",
  "Cozy desk lamp, open book, late calm hour",
  "Morning light on a wooden table and planner",
  "Notebook and pencil by a small indoor plant",
  "Reading nook with soft cushions and stacked books",
  "Minimal study corner, warm neutral tones",
]


def _local_today_iso(tz_name: Optional[str]) -> str:
  if tz_name:
    return datetime.now(ZoneInfo(tz_name)).date().isoformat()
  return datetime.now().astimezone().date().isoformat()


def _theme_for_date(iso_date: str) -> str:
  y, m, d = (int(x) for x in iso_date.split("-"))
  ordinal = datetime(y, m, d).timetuple().tm_yday
  return _THEMES[ordinal % len(_THEMES)]


def _hero_dir() -> Path:
  DAILY_HERO_DIR.mkdir(parents=True, exist_ok=True)
  return DAILY_HERO_DIR


def _image_path(filename: str) -> Path:
  return _hero_dir() / filename


def _row_to_out(row: Any) -> schemas.DailyHeroOut:
  return schemas.DailyHeroOut(
    date=row.hero_date_local,
    theme=row.theme,
    title=row.title,
    subtitle=row.subtitle,
    image_url=f"/api/daily-hero/image?v={row.id}",
  )


def _download_url(url: str) -> bytes:
  req = urllib.request.Request(url, headers={"User-Agent": "LearnTogether/1.0"})
  with urllib.request.urlopen(req, timeout=120) as resp:
    return resp.read()


def _generate_copy_and_prompt(client: Any, theme_seed: str) -> tuple[str, str, str, str]:
  chat_model = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")
  system = (
    "You write short UI copy and one image prompt for a daily study-motivation hero. "
    "Return strict JSON only with keys: theme (string, one short phrase), "
    "title (max 8 words), subtitle (max 18 words), image_prompt (English, for an image model). "
    "The illustration must be calm, literary, study-focused, wide landscape composition "
    "with clear negative space in upper or side areas for overlay text (no text in the image). "
    "No logos, no watermarks, no photorealistic faces."
  )
  user = f"Today's visual theme seed: {theme_seed}. Vary mood slightly from generic stock art."
  resp = client.chat.completions.create(
    model=chat_model,
    response_format={"type": "json_object"},
    messages=[
      {"role": "system", "content": system},
      {"role": "user", "content": user},
    ],
    temperature=0.9,
  )
  raw = (resp.choices[0].message.content or "").strip()
  data = json.loads(raw)
  theme = str(data.get("theme") or theme_seed)[:200]
  title = str(data.get("title") or "Keep studying")[:200]
  subtitle = str(data.get("subtitle") or "One calm step at a time.")[:400]
  image_prompt = str(data.get("image_prompt") or theme_seed)[:4000]
  return theme, title, subtitle, image_prompt


def _default_image_kwargs(model: str) -> dict[str, Any]:
  if model.startswith("dall-e-3"):
    return {"size": "1792x1024", "quality": "standard"}
  if "gpt-image" in model:
    return {"size": "1536x1024"}
  return {}


def _generate_image_bytes(client: Any, image_prompt: str) -> bytes:
  preferred = (os.getenv("OPENAI_IMAGE_MODEL") or "").strip()
  last_err: Optional[Exception] = None
  candidates: list[str] = []
  if preferred:
    candidates.append(preferred)
  candidates.extend(["gpt-image-1", "dall-e-3"])
  seen: set[str] = set()
  for m in candidates:
    if m in seen:
      continue
    seen.add(m)
    try:
      extra = _default_image_kwargs(m)
      kwargs: dict[str, Any] = {"model": m, "prompt": image_prompt, "n": 1, **extra}
      r = client.images.generate(**kwargs)
      item = r.data[0]
      if getattr(item, "b64_json", None):
        return base64.b64decode(item.b64_json)
      if getattr(item, "url", None):
        return _download_url(item.url)
    except Exception as exc:
      last_err = exc
      logger.warning("OpenAI image model %s failed: %s", m, exc)
  if last_err:
    raise last_err
  raise RuntimeError("no image models attempted")


def _persist_new_hero(db: Session, hero_date_local: str) -> schemas.DailyHeroOut:
  from openai import OpenAI

  api_key = os.getenv("OPENAI_API_KEY", "").strip()
  if not api_key:
    return schemas.DailyHeroOut(date=hero_date_local)

  theme_seed = _theme_for_date(hero_date_local)
  client = OpenAI(api_key=api_key)
  theme, title, subtitle, image_prompt = _generate_copy_and_prompt(client, theme_seed)
  image_bytes = _generate_image_bytes(client, image_prompt)
  filename = f"{hero_date_local}.png"
  path = _image_path(filename)
  path.write_bytes(image_bytes)
  now = datetime.now(timezone.utc)
  row = crud.create_daily_hero(
    db,
    hero_date_local=hero_date_local,
    theme=theme,
    title=title,
    subtitle=subtitle,
    image_filename=filename,
    created_at=now,
  )
  return _row_to_out(row)


def get_daily_hero_response(db: Session) -> schemas.DailyHeroOut:
  tz_name = os.getenv("CHECKIN_TZ")
  today = _local_today_iso(tz_name)
  row = crud.get_daily_hero_by_date(db, hero_date_local=today)
  if row:
    path = _image_path(row.image_filename)
    if path.is_file():
      return _row_to_out(row)
    crud.delete_daily_hero(db, row=row)

  api_key = os.getenv("OPENAI_API_KEY", "").strip()
  if not api_key:
    return schemas.DailyHeroOut(date=today)

  try:
    return _persist_new_hero(db, today)
  except IntegrityError:
    db.rollback()
    row = crud.get_daily_hero_by_date(db, hero_date_local=today)
    if row and _image_path(row.image_filename).is_file():
      return _row_to_out(row)
    return schemas.DailyHeroOut(date=today)
  except Exception:
    logger.exception("daily hero generation failed for %s", today)
    return schemas.DailyHeroOut(date=today)


def get_today_hero_image_path(db: Session) -> Optional[Path]:
  tz_name = os.getenv("CHECKIN_TZ")
  today = _local_today_iso(tz_name)
  row = crud.get_daily_hero_by_date(db, hero_date_local=today)
  if row is None:
    return None
  path = _image_path(row.image_filename)
  if path.is_file():
    return path
  return None
