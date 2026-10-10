# 💀📸 Screenshot Graveyard Solver

> **AI-Powered Screenshot-to-Task Converter** — Stop losing action items buried in screenshots. Upload any screenshot and let AI extract actionable tasks automatically.

## 🎯 The Problem

People constantly take screenshots of Slack messages, emails, Zoom mockups, or notes to remind themselves of tasks. These screenshots pile up endlessly in camera rolls and the underlying tasks are completely forgotten — the **Screenshot Graveyard**.

## 💡 The Solution

A **Screenshot-to-Task Converter** app that uses AI-powered OCR to:
1. **Extract text** from any screenshot using Gemini Vision AI
2. **Identify action items** — tasks, deadlines, assignments, priorities
3. **Store tasks** with metadata (date, priority, source) in a local database
4. **Display everything** in a beautiful dark-mode dashboard

## 🏗️ Architecture

```
┌─────────────────────────┐
│   Browser / Mobile      │
│   (Web Dashboard UI)    │
└───────────┬─────────────┘
            │ HTTP
┌───────────▼─────────────┐
│  Service 1: Axum (Rust) │  Port 3001
│  Frontend + API Gateway │
└──────┬──────────┬───────┘
       │          │
┌──────▼───┐  ┌──▼──────────────┐
│ Service 2│  │   Service 3     │
│ Crow C++ │  │ FastAPI Python  │
│ Backend  │  │ AI OCR Engine   │
│ Port 8081│  │ Port 8000       │
│          │  │                 │
│ SQLite   │  │ Gemini Vision   │
└──────────┘  └─────────────────┘
```

| Service | Language | Framework | Port | Role |
|---------|----------|-----------|------|------|
| Frontend + Gateway | Rust | Axum 0.8 | 3001 | Serves UI, routes API calls |
| Task Backend | C++ | Crow + SQLite | 8081 | CRUD operations, data storage |
| AI OCR Engine | Python | FastAPI + Gemini | 8000 | Screenshot OCR, task extraction |

## 🚀 Quick Start

### Prerequisites

- **Rust** (1.70+) — [Install](https://rustup.rs/)
- **C++ compiler** (GCC 11+ or Clang 14+)
- **CMake** (3.16+)
- **Python** (3.10+)
- **SQLite3** development headers
- **Gemini API Key** — [Get free key](https://aistudio.google.com/apikey)

### Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd hackathon_TRG

# 2. Set your Gemini API key
cp .env .env.backup  # optional
nano .env
# Set GEMINI_API_KEY=your_actual_key

# 3. Start all services
chmod +x start.sh
./start.sh
```

### Manual Setup (Service by Service)

#### C++ Backend
```bash
cd backend
mkdir -p build && cd build
cmake ..
cmake --build . -j$(nproc)
./task_server  # Runs on :8081
```

#### Python AI Service
```bash
cd ai-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py  # Runs on :8000
```

#### Rust Frontend
```bash
cd frontend
cargo run  # Runs on :3001
```

### Open the App
Navigate to **http://localhost:3001** in your browser.

## 📡 API Endpoints

### Gateway (Axum — :3001)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload screenshot → OCR → Store tasks |
| GET | `/api/tasks` | List all tasks (with filters) |
| GET | `/api/tasks/{id}` | Get single task |
| PUT | `/api/tasks/{id}` | Update task |
| DELETE | `/api/tasks/{id}` | Delete task |
| GET | `/api/health` | Health check |

### Backend (Crow — :8081)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tasks` | Create single task |
| POST | `/api/tasks/ocr-import` | Bulk import from OCR |
| GET | `/api/tasks?status=&date=&source=` | List with filters |
| GET | `/api/tasks/<id>` | Get task |
| PUT | `/api/tasks/<id>` | Update task |
| DELETE | `/api/tasks/<id>` | Delete task |

### AI Service (FastAPI — :8000)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/extract-tasks` | Upload image → OCR + Task extraction |
| GET | `/health` | Health check |
| GET | `/docs` | Interactive API documentation |

## 🛠️ Tech Stack

- **🦀 Rust (Axum)** — High-performance async web server
- **⚡ C++ (Crow)** — Zero-overhead task backend with SQLite
- **🐍 Python (FastAPI)** — AI/ML service with Gemini Vision
- **🤖 Google Gemini** — Multimodal AI for OCR + task extraction
- **🗄️ SQLite** — Lightweight local database

## 📁 Project Structure

```
hackathon_TRG/
├── frontend/              # Rust (Axum) — Web UI + API Gateway
│   ├── Cargo.toml
│   ├── src/main.rs
│   └── static/
│       ├── index.html
│       ├── css/style.css
│       └── js/app.js
├── backend/               # C++ (Crow) — Task Backend
│   ├── CMakeLists.txt
│   ├── include/
│   │   ├── models.hpp
│   │   └── database.hpp
│   └── src/
│       ├── main.cpp
│       └── database.cpp
├── ai-service/            # Python (FastAPI) — AI OCR
│   ├── requirements.txt
│   ├── main.py
│   ├── schemas.py
│   └── services.py
├── .env                   # Environment variables
├── start.sh               # Launch all services
└── README.md
```

## 👥 Team

Built at **TRG Hackathon 2026**

## 📄 License

MIT
