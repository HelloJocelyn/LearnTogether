from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ItemCreate(BaseModel):
  title: str


class ItemOut(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: int
  title: str


CheckinSessionStatus = Literal["morning", "night", "normal", "late", "leave", "outside"]


class CheckInCreate(BaseModel):
  nickname: str
  status: Optional[Literal["leave"]] = None


class CheckInOut(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: int
  created_at: datetime
  nickname: str
  is_real: bool
  status: CheckinSessionStatus
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
  roll_number: Optional[int] = None
  notes: Optional[str] = None
  detail_json: Optional[str] = None


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


def derive_learning_goal_progress(total_units: int, complete_units: int) -> int:
  """Map complete/total units to 0–100% (rounded). Call when total_units > 0."""
  if total_units <= 0:
    return 0
  return min(100, max(0, round(complete_units * 100 / total_units)))


class LearningGoalCreate(BaseModel):
  name: str = Field(min_length=1, max_length=200)
  progress: int = Field(default=0, ge=0, le=100)
  total_units: int = Field(default=0, ge=0)
  complete_units: int = Field(default=0, ge=0)
  start_date: Optional[date] = None
  deadline: Optional[date] = None

  @model_validator(mode="after")
  def validate_units(self) -> "LearningGoalCreate":
    if self.total_units > 0 and self.complete_units > self.total_units:
      raise ValueError("complete_units cannot exceed total_units")
    if self.start_date is not None and self.deadline is not None and self.start_date > self.deadline:
      raise ValueError("start_date cannot be after deadline")
    if self.total_units > 0:
      object.__setattr__(self, "progress", derive_learning_goal_progress(self.total_units, self.complete_units))
    return self


class LearningGoalUpdate(BaseModel):
  name: Optional[str] = Field(None, min_length=1, max_length=200)
  progress: Optional[int] = Field(None, ge=0, le=100)
  total_units: Optional[int] = Field(None, ge=0)
  complete_units: Optional[int] = Field(None, ge=0)
  start_date: Optional[date] = None
  deadline: Optional[date] = None


class LearningGoalOut(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: int
  created_at: datetime
  name: str
  progress: int
  total_units: int
  complete_units: int
  start_date: Optional[date] = None
  deadline: Optional[date] = None
  behind_pace: bool = False
  expected_units_pace: Optional[int] = None

  @model_validator(mode="after")
  def sync_progress_from_units(self) -> "LearningGoalOut":
    if self.total_units > 0:
      derived = derive_learning_goal_progress(self.total_units, self.complete_units)
      if derived != self.progress:
        return self.model_copy(update={"progress": derived})
    return self


def attach_learning_goal_pace(out: LearningGoalOut, *, today: date) -> LearningGoalOut:
  """Set behind_pace / expected_units_pace using linear spread over start_date…deadline."""
  from .learning_goal_pace import pace_expected_and_behind

  behind, exp = pace_expected_and_behind(
    start_date=out.start_date,
    deadline=out.deadline,
    total_units=out.total_units,
    complete_units=out.complete_units,
    today=today,
  )
  return out.model_copy(update={"behind_pace": behind, "expected_units_pace": exp})


class MemberCreate(BaseModel):
  name: str = Field(min_length=1, max_length=80)
  role: str = Field(min_length=1, max_length=80)
  goal: str = Field(min_length=1, max_length=80)


class MemberOut(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: int
  created_at: datetime
  name: str
  role: str
  goal: str
  is_active: bool


class CheckinWindowConfig(BaseModel):
  morning_start: str = Field(pattern=r"^\d{2}:\d{2}$")
  morning_end: str = Field(pattern=r"^\d{2}:\d{2}$")
  night_start: str = Field(pattern=r"^\d{2}:\d{2}$")
  night_end: str = Field(pattern=r"^\d{2}:\d{2}$")


class CheckinWindowConfigOut(CheckinWindowConfig):
  app_env: str
  source: str


class ZoomJoinHintsOut(BaseModel):
  meeting_id: Optional[str] = None
  passcode: Optional[str] = None
  join_url: Optional[str] = None


class ZoomJoinHintsIn(BaseModel):
  meeting_id: Optional[str] = None
  passcode: Optional[str] = None
  join_url: Optional[str] = None


class StatisticsSettingsOut(BaseModel):
  weekly_no_checkin_threshold: int = Field(ge=0, le=7)


class StatisticsSettingsIn(BaseModel):
  weekly_no_checkin_threshold: int = Field(ge=0, le=7)


class DailyHeroSettingsOut(BaseModel):
  daily_hero_openai_api_key_set: bool


class DailyHeroSettingsIn(BaseModel):
  daily_hero_openai_api_key: str = ""


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

