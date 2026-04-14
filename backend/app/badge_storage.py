import os
import uuid
from pathlib import Path
from typing import Optional

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
BADGE_CERT_DIR = Path(os.getenv("BADGE_CERT_DIR", str(_BACKEND_ROOT / "data" / "badge_certificates")))

ALLOWED_IMAGE_TYPES = frozenset(
  {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  }
)

_EXT_BY_TYPE = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
}

MAX_BYTES = 6 * 1024 * 1024


def ensure_dir() -> Path:
  BADGE_CERT_DIR.mkdir(parents=True, exist_ok=True)
  return BADGE_CERT_DIR


def path_for_stored_filename(name: str) -> Path:
  return ensure_dir() / name


def save_certificate_image(*, badge_id: int, content_type: Optional[str], data: bytes) -> str:
  if len(data) > MAX_BYTES:
    raise ValueError("certificate image too large (max 6MB)")
  ct = (content_type or "").split(";")[0].strip().lower()
  if ct not in ALLOWED_IMAGE_TYPES:
    raise ValueError("certificate must be a JPEG, PNG, WebP, or GIF image")
  ext = _EXT_BY_TYPE[ct]
  filename = f"{badge_id}_{uuid.uuid4().hex}{ext}"
  path = ensure_dir() / filename
  path.write_bytes(data)
  return filename


def delete_stored_file(filename: Optional[str]) -> None:
  if not filename:
    return
  path = BADGE_CERT_DIR / filename
  try:
    path.unlink(missing_ok=True)
  except OSError:
    pass
