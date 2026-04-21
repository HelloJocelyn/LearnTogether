"""
Parse Excel-exported morning check-in CSVs (早自习打卡表).

Layout (1-based rows as in Excel):
  Row 1: title, may contain (YYYY年M月) for year/month.
  Row 2: 番号, 姓名, then alternating date labels (M/D), empty, ...
  Row 3: empty cells, then 状态, 参加时间 repeated per day until 出勤天数.
  Row 4+: data — index, name, then pairs (状态, 参加时间).

Status symbols: √ on-time → morning; 迟 → late; 请 → leave. Empty pair → skip.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo


_TITLE_YEAR_MONTH = re.compile(r"(?P<y>\d{4})\s*年\s*(?P<m>\d{1,2})\s*月")
_DAY_LABEL = re.compile(r"^\s*(?P<m>\d{1,2})/(?P<d>\d{1,2})\s*$")
_TIME_FRAGMENT = re.compile(
  r"(?P<h>\d{1,2})\s*[：:]\s*(?P<mi>\d{2})(?:\s*:\s*(?P<s>\d{2}))?",
  re.UNICODE,
)
_SIMPLE_RANGE = re.compile(r"^\s*(?P<a>\d{1,2})\s*-\s*(?P<b>\d{1,2})\s*$")


@dataclass(frozen=True)
class ParsedCheckinCell:
  nickname: str
  local_date: date
  status: str
  time_raw: str


def parse_title_year_month(title_row: str) -> tuple[int | None, int | None]:
  m = _TITLE_YEAR_MONTH.search(title_row or "")
  if not m:
    return None, None
  return int(m.group("y")), int(m.group("m"))


def _normalize_status_cell(raw: str) -> str | None:
  s = raw.replace("\ufeff", "").strip()
  if not s:
    return None
  if s in ("√", "✓", "✔", "v", "V"):
    return "morning"
  if s == "迟":
    return "late"
  if s == "请":
    return "leave"
  return None


def parse_local_time_from_attendance_cell(text: str) -> time | None:
  """Extract a plausible check-in clock time from the 参加时间 column."""
  raw = text.replace("\ufeff", "").strip()
  if not raw:
    return None

  first = _TIME_FRAGMENT.search(raw)
  if first:
    h = int(first.group("h"))
    mi = int(first.group("mi"))
    if 0 <= h <= 23 and 0 <= mi <= 59:
      return time(h, mi)

  simplified = raw.replace("～", "-").replace("—", "-").strip()
  rng = _SIMPLE_RANGE.match(simplified)
  if rng:
    a = int(rng.group("a"))
    if 0 <= a <= 23:
      return time(a, 0)

  return None


def utc_datetime_for_import(*, d: date, time_cell: str, status: str, tz_name: str) -> datetime:
  """Build stored created_at (UTC) for an imported row."""
  if status == "leave":
    default_t = time(9, 0)
  elif status == "late":
    default_t = time(6, 30)
  else:
    default_t = time(5, 30)

  lt = parse_local_time_from_attendance_cell(time_cell) or default_t
  local = datetime(d.year, d.month, d.day, lt.hour, lt.minute, lt.second, tzinfo=ZoneInfo(tz_name))
  return local.astimezone(timezone.utc)


def _pad_row(row: list[str], min_len: int) -> list[str]:
  if len(row) >= min_len:
    return row
  return row + [""] * (min_len - len(row))


def find_header_row_index(rows: list[list[str]], scan: int = 50) -> int | None:
  for i in range(min(len(rows), scan)):
    row = rows[i]
    if len(row) < 3:
      continue
    if row[0].strip() == "番号" and row[1].strip() == "姓名":
      return i
  return None


def find_attendance_summary_column(header_row: list[str]) -> int:
  for i, cell in enumerate(header_row):
    if cell and "出勤" in cell.strip():
      return i
  return len(header_row)


def build_day_slots(
  header_row: list[str], *, year: int, attendance_col: int
) -> tuple[list[tuple[int, date]], list[str]]:
  slots: list[tuple[int, date]] = []
  warnings: list[str] = []
  col = 2
  while col + 1 < attendance_col:
    label = header_row[col].strip() if col < len(header_row) else ""
    if label:
      m = _DAY_LABEL.match(label)
      if m:
        mo = int(m.group("m"))
        dom = int(m.group("d"))
        try:
          slots.append((col, date(year, mo, dom)))
        except ValueError:
          warnings.append(f"invalid date label {label!r} for year {year}")
      else:
        warnings.append(f"unexpected day label {label!r} at column {col}")
    col += 2
  return slots, warnings


def parse_checkin_csv_text(
  text: str,
  *,
  default_year: int | None,
) -> tuple[list[ParsedCheckinCell], dict[str, object]]:
  """
  Returns parsed cells plus metadata:
  resolved_year, title_year, title_month, warnings (list).
  """
  warnings: list[str] = []
  reader = csv.reader(io.StringIO(text))
  rows: list[list[str]] = [list(r) for r in reader]

  title_y, title_m = None, None
  if rows and rows[0]:
    title_y, title_m = parse_title_year_month(",".join(rows[0][:3]))

  year = title_y or default_year
  if year is None:
    raise ValueError("cannot determine year: add (YYYY年M月) to the sheet title or pass default_year")

  hdr_i = find_header_row_index(rows)
  if hdr_i is None:
    raise ValueError("cannot find header row (番号, 姓名)")

  header = rows[hdr_i]
  attendance_col = find_attendance_summary_column(header)
  slots, slot_warn = build_day_slots(header, year=year, attendance_col=attendance_col)
  warnings.extend(slot_warn)
  if title_m is not None and slots:
    first_m = slots[0][1].month
    if first_m != title_m:
      warnings.append(
        f"title month {title_m} differs from first day column month {first_m}; using column dates."
      )

  out: list[ParsedCheckinCell] = []
  skipped_unknown_status = 0

  max_col = max((s[0] + 2 for s in slots), default=2)
  for r in rows[hdr_i + 2 :]:
    if not r or not r[0].strip():
      continue
    if not r[0].strip().isdigit():
      if "说明" in r[0]:
        break
      continue
    name = r[1].strip() if len(r) > 1 else ""
    if not name:
      continue

    nickname = name[:80]
    if len(name) > 80:
      warnings.append(f"truncated nickname longer than 80 chars: {name[:20]}…")

    row = _pad_row(list(r), max_col + 2)
    for scol, d in slots:
      st_cell = row[scol].strip() if scol < len(row) else ""
      time_cell = row[scol + 1].strip() if scol + 1 < len(row) else ""
      mapped = _normalize_status_cell(st_cell)
      if mapped is None:
        if st_cell:
          skipped_unknown_status += 1
        continue
      out.append(
        ParsedCheckinCell(
          nickname=nickname,
          local_date=d,
          status=mapped,
          time_raw=time_cell,
        )
      )

  meta: dict[str, object] = {
    "resolved_year": year,
    "title_year": title_y,
    "title_month": title_m,
    "warnings": warnings,
    "skipped_unknown_status_cells": skipped_unknown_status,
  }
  return out, meta


def parse_checkin_csv_bytes(
  data: bytes,
  *,
  default_year: int | None,
) -> tuple[list[ParsedCheckinCell], dict[str, object]]:
  try:
    text = data.decode("utf-8-sig")
  except UnicodeDecodeError as exc:
    raise ValueError("CSV must be UTF-8 (Excel: Save As CSV UTF-8)") from exc
  return parse_checkin_csv_text(text, default_year=default_year)
