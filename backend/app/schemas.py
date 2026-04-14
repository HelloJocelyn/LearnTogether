from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ItemCreate(BaseModel):
  title: str


class ItemOut(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: int
  title: str


class CheckInCreate(BaseModel):
  nickname: str
  status: Optional[Literal["normal", "late", "leave", "outside"]] = None


class CheckInOut(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: int
  created_at: datetime
  nickname: str
  is_real: bool
  status: Literal["normal", "late", "leave", "outside"]
  checkin_date_local: Optional[str] = None


AttendanceStatus = Literal["attended", "not_attended", "unknown"]
AttendanceImportStatus = Literal["draft", "confirmed", "failed"]


class AttendanceImportItemUpdate(BaseModel):
  id: Optional[int] = None
  name: str = Field(min_length=1, max_length=120)
  attendance_status: AttendanceStatus


class AttendanceImportItemOut(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: int
  import_id: int
  name: str
  attendance_status: AttendanceStatus
  confidence: int
  is_edited: bool


class AttendanceImportOut(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: int
  created_at: datetime
  source_filename: str
  ocr_raw_text: str
  status: AttendanceImportStatus


class AttendanceImportDetailOut(BaseModel):
  import_info: AttendanceImportOut
  items: list[AttendanceImportItemOut]


class AttendanceImportOcrOut(BaseModel):
  import_info: AttendanceImportOut
  items: list[AttendanceImportItemOut]


class AttendanceImportConfirmOut(BaseModel):
  import_id: int
  status: AttendanceImportStatus
  total: int
  attended: int
  not_attended: int
  unknown: int


class MemberCreate(BaseModel):
  name: str = Field(min_length=1, max_length=80)


class MemberOut(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: int
  created_at: datetime
  name: str
  is_active: bool


class CheckinWindowConfig(BaseModel):
  normal_start: str = Field(pattern=r"^\d{2}:\d{2}$")
  normal_end: str = Field(pattern=r"^\d{2}:\d{2}$")
  late_end: str = Field(pattern=r"^\d{2}:\d{2}$")


class CheckinWindowConfigOut(CheckinWindowConfig):
  app_env: str
  source: str


class DailyHeroOut(BaseModel):
  date: str
  theme: Optional[str] = None
  title: Optional[str] = None
  subtitle: Optional[str] = None
  image_url: Optional[str] = None


class AchievementBadgeOut(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: int
  created_at: datetime
  nickname: str
  title: str
  earned_date_local: str
  member_id: Optional[int] = None
  certificate_image_url: Optional[str] = None


def achievement_badge_to_out(row: object) -> AchievementBadgeOut:
  from .models import AchievementBadge

  if not isinstance(row, AchievementBadge):
    raise TypeError("expected AchievementBadge ORM row")
  return AchievementBadgeOut(
    id=row.id,
    created_at=row.created_at,
    nickname=row.nickname,
    title=row.title,
    earned_date_local=row.earned_date_local,
    member_id=row.member_id,
    certificate_image_url=(
      f"/api/badges/{row.id}/certificate?v={row.id}" if row.certificate_image_filename else None
    ),
  )

