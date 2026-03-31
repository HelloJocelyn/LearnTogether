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


class CheckInOut(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: int
  created_at: datetime
  nickname: str
  is_real: bool
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

