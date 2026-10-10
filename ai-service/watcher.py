import os
import asyncio
import time
from pathlib import Path
import requests
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class ScreenshotHandler(FileSystemEventHandler):
    def __init__(self, ocr_service, loop):
        self.ocr_service = ocr_service
        self.loop = loop
        self.backend_url = os.getenv("BACKEND_URL", "http://localhost:8081")

    def on_created(self, event):
        if event.is_directory:
            return
        
        filepath = Path(event.src_path)
        # Check if it's an image
        if filepath.suffix.lower() not in ['.png', '.jpg', '.jpeg', '.webp', '.heic']:
            return
        
        print(f"📸 New screenshot detected: {filepath.name}")
        
        # Schedule the async processing task
        asyncio.run_coroutine_threadsafe(
            self.process_image(filepath),
            self.loop
        )

    async def process_image(self, filepath: Path):
        # Wait a moment to ensure file is completely written by the OS
        await asyncio.sleep(1)
        
        try:
            with open(filepath, 'rb') as f:
                image_bytes = f.read()
            
            # Use basic extension matching for mime type
            mime_type = "image/png"
            if filepath.suffix.lower() in ['.jpg', '.jpeg']:
                mime_type = "image/jpeg"
            elif filepath.suffix.lower() == '.webp':
                mime_type = "image/webp"

            print(f"🔍 Analyzing {filepath.name} with AI...")
            result = await self.ocr_service.extract_tasks(image_bytes, mime_type)
            
            # Map AI fields to Backend expected fields
            tasks_mapped = []
            for t in result.tasks:
                desc = t.description
                if t.assignee:
                    desc += f" (Assignee: {t.assignee})"
                
                tasks_mapped.append({
                    "title": t.title,
                    "description": desc,
                    "due_date": t.deadline or "",
                    "priority": t.priority,
                    "status": "pending",
                    "source": "ocr",
                    "raw_ocr_text": result.raw_ocr_text,
                    "confidence": 1.0
                })
            
            payload = {
                "source_image": filepath.name,
                "raw_text": result.raw_ocr_text,
                "tasks": tasks_mapped
            }

            print(f"🚀 Found {len(tasks_mapped)} tasks, sending to C++ backend...")
            
            # Post to C++ backend
            response = requests.post(
                f"{self.backend_url}/api/tasks/ocr-import",
                json=payload
            )
            
            if response.status_code == 201:
                print(f"✅ Successfully saved tasks for {filepath.name}!")
                # Optionally move the file to a 'processed' folder
                # processed_dir = filepath.parent / "processed"
                # processed_dir.mkdir(exist_ok=True)
                # filepath.rename(processed_dir / filepath.name)
            else:
                print(f"❌ Backend error: {response.text}")
                
        except Exception as e:
            print(f"❌ Error processing {filepath.name}: {str(e)}")

async def start_watcher(watch_dir: Path, ocr_service):
    print(f"👀 Starting background watcher on: {watch_dir}")
    loop = asyncio.get_running_loop()
    
    event_handler = ScreenshotHandler(ocr_service, loop)
    observer = Observer()
    observer.schedule(event_handler, str(watch_dir), recursive=False)
    observer.start()
    
    try:
        # Keep running
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        print("🛑 Stopping background watcher...")
        observer.stop()
    observer.join()
