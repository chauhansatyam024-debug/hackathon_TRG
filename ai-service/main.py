import io
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

from schemas import TaskExtractionResponse
from services import GeminiOCRService



app = FastAPI(
    title="Screenshot OCR & Task Extraction Service",
    version="1.0.0",
    description="AI-powered OCR and task extraction from screenshots using Gemini Vision"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_service_instance = None

def get_ocr_service() -> GeminiOCRService:
    global _service_instance
    if _service_instance is None:
        _service_instance = GeminiOCRService()
    return _service_instance

ALLOWED_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"}
MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ocr-task-extraction"}

@app.post("/extract-tasks", response_model=TaskExtractionResponse)
async def extract_tasks_from_image(
    file: UploadFile = File(..., description="Screenshot image file"),
    service: GeminiOCRService = Depends(get_ocr_service)
):
    content_type = file.content_type or ""
    if content_type.lower() not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{content_type}'")
    
    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(image_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 15MB limit")
    
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
    except Exception:
        raise HTTPException(status_code=400, detail="Corrupted or invalid image file")
    
    result = await service.extract_tasks(image_bytes=image_bytes, mime_type=content_type)
    result.filename = file.filename
    
    # Folder routing based on AI Triage
    storage_dir = Path(__file__).parent.parent / "storage"
    target_folder = storage_dir / ("important" if result.is_important else "unimportant")
    target_folder.mkdir(parents=True, exist_ok=True)
    
    # Save the file
    safe_filename = file.filename if file.filename else "upload.jpg"
    file_path = target_folder / safe_filename
    with open(file_path, "wb") as f:
        f.write(image_bytes)
        
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
