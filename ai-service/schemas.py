from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field

class PriorityEnum(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"

class TaskItem(BaseModel):
    title: str = Field(..., description="A short, descriptive title for the task")
    description: str
    priority: PriorityEnum
    deadline: Optional[str] = None
    assignee: Optional[str] = None

class TaskExtractionResponse(BaseModel):
    filename: Optional[str] = None
    is_important: bool = Field(..., description="True if the image contains actionable tasks or important information to save. False if it is junk, a meme, an accidental screenshot, or otherwise unimportant.")
    raw_ocr_text: str
    summary: str
    tasks: List[TaskItem]
