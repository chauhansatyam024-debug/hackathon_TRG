# Changes Made: Screenshot Graveyard Solver Implementation

This document summarizes all the changes and files created to build the 3-service architecture for the Screenshot Graveyard Solver.

## Architectural Update: Background Folder Watcher
The architecture has been updated from a manual UI upload system to a background folder watcher.
*   **Removed:** The web UI no longer has drag-and-drop upload functionality.
*   **Added:** The Python AI service now runs a background thread that monitors the `screenshots_inbox/` folder. When a new screenshot is placed in this folder, it automatically extracts tasks via Gemini and saves them to the database. The UI automatically polls for new tasks every 5 seconds.

## 1. Axum Frontend & API Gateway (Rust)
**Path:** `frontend/`
*   `frontend/Cargo.toml`: Configured dependencies including `axum`, `tokio`, `tower-http` (for serving static files and CORS), and `reqwest` (for proxying API calls).
*   `frontend/src/main.rs`: Implemented the Axum server. It serves the static UI and proxies all CRUD API calls directly to the C++ backend. (The `upload_handler` was removed in favor of the background watcher).
*   `frontend/static/index.html`: Created a premium, dark-mode dashboard UI featuring a task grid that takes full advantage of the screen real estate.
*   `frontend/static/css/style.css`: Styled the UI with glassmorphism, smooth animations, priority badges, and responsive design using CSS custom properties.
*   `frontend/static/js/app.js`: Added client-side logic for API interactions, dynamic DOM updates, filtering, and toast notifications. Added automatic background polling (every 5 seconds) to fetch new tasks.

## 2. C++ Task Backend (Crow)
**Path:** `backend/`
*   `backend/CMakeLists.txt`: Configured the build system using `FetchContent` to automatically download and link Crow (v1.2.0) and `nlohmann/json`. Linked against SQLite3 and Threads.
*   `backend/include/models.hpp`: Defined the `Task` struct with JSON serialization/deserialization capabilities.
*   `backend/include/database.hpp` & `backend/src/database.cpp`: Implemented a thread-safe SQLite wrapper. It uses `std::mutex` and WAL mode to handle concurrent access safely. Includes methods for CRUD operations and batch inserts.
*   `backend/src/main.cpp`: Implemented the Crow REST API server with CORS enabled. Provides endpoints for task management (`/api/tasks`) and a specific endpoint for OCR batch imports (`/api/tasks/ocr-import`). Listens on port 8081.

## 3. Python AI OCR Engine (FastAPI)
**Path:** `ai-service/`
*   `ai-service/requirements.txt`: Listed required packages: `fastapi`, `google-genai`, `pillow`, `pydantic`, `watchdog`, `requests`.
*   `ai-service/watcher.py`: **[NEW]** Implemented a background folder monitor using `watchdog`. It detects new images in `screenshots_inbox/`, triggers the OCR service, and posts the results directly to the C++ backend.
*   `ai-service/schemas.py`: Defined Pydantic models for structured output, specifically the `TaskExtractionResponse` that the Gemini model must adhere to.
*   `ai-service/services.py`: Implemented `GeminiOCRService` using the new `google-genai` SDK. It sends the image and prompt to `gemini-2.0-flash` and enforces the JSON schema.
*   `ai-service/main.py`: Created the FastAPI application. Uses an asynchronous lifespan context manager to start the `watcher.py` process automatically when the server boots.

## 4. Supporting Files
**Path:** Root directory (`/home/satyamchauhan/2ndyr/hackathon_TRG/`)
*   `screenshots_inbox/`: **[NEW]** The folder where you drop screenshots for automatic processing.
*   `.env`: Created a template for environment variables (`GEMINI_API_KEY`, `AI_SERVICE_URL`, `BACKEND_URL`).
*   `start.sh`: Created a bash script to build (if necessary) and launch all three services concurrently with color-coded output. Automatically creates the `screenshots_inbox/` folder. Made it executable (`chmod +x`).
*   `README.md`: Wrote comprehensive documentation detailing the architecture, prerequisites, setup instructions, and API endpoints. Updated to reflect new ports (3001 and 8081).
