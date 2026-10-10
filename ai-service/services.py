import os
from google import genai
from google.genai import types
from fastapi import HTTPException
from schemas import TaskExtractionResponse


class GeminiOCRService:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not set")
        self.client = genai.Client(api_key=api_key)
        self.model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    async def extract_tasks(self, image_bytes: bytes, mime_type: str) -> TaskExtractionResponse:
        system_instruction = (
            "You are an expert AI productivity assistant specializing in OCR and task extraction.\n"
            "Examine the provided screenshot thoroughly:\n"
            "1. TRIAGE: Determine if the image is 'Important' (contains tasks, schedules, useful text) or 'Unimportant' (memes, junk, accidental screenshots). Set is_important accordingly.\n"
            "2. Transcribe all legible text into raw_ocr_text.\n"
            "3. Identify any explicit or implicit action items, to-dos, deadlines, or pending tasks.\n"
            "4. Assess priority: 'urgent' (immediate/today), 'high' (soon/flagged), 'medium' (standard), 'low' (backlog/nice-to-have).\n"
            "5. Extract any deadlines, dates, or assignees mentioned."
        )
        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=[system_instruction, image_part, "Extract the OCR text and all actionable tasks according to the required schema."],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=TaskExtractionResponse,
                    temperature=0.1,
                )
            )
            if not response.parsed:
                raise HTTPException(status_code=500, detail="Failed to parse model response")
            return response.parsed
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Gemini API Error: {str(e)}")
