from pydantic import BaseModel, ConfigDict
from datetime import datetime


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

