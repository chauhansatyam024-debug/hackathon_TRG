#!/bin/bash
# ============================================
# Screenshot Graveyard Solver — Service Launcher
# Starts all 3 microservices simultaneously
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo -e "${PURPLE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║   💀📸 Screenshot Graveyard Solver           ║${NC}"
echo -e "${PURPLE}║   Starting all services...                   ║${NC}"
echo -e "${PURPLE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Check .env file
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${RED}Error: .env file not found! Copy .env.example to .env and set your GEMINI_API_KEY${NC}"
    exit 1
fi

# Export .env variables
export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)

if [ "$GEMINI_API_KEY" = "your_gemini_api_key_here" ] || [ -z "$GEMINI_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  WARNING: GEMINI_API_KEY is not set in .env file!${NC}"
    echo -e "${YELLOW}   AI OCR will not work until you set a valid API key.${NC}"
    echo -e "${YELLOW}   Get one free at: https://aistudio.google.com/apikey${NC}"
    echo ""
fi

# Create screenshots inbox folder
mkdir -p "$PROJECT_ROOT/screenshots_inbox"

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down all services...${NC}"
    kill $PID_BACKEND $PID_AI $PID_FRONTEND 2>/dev/null
    wait $PID_BACKEND $PID_AI $PID_FRONTEND 2>/dev/null
    echo -e "${GREEN}All services stopped.${NC}"
}
trap cleanup EXIT INT TERM

# ============================================
# Service 1: C++ Backend (Port 8081)
# ============================================
echo -e "${CYAN}[1/3] Starting C++ Backend (Crow) on :8081...${NC}"

if [ ! -f "$PROJECT_ROOT/backend/build/task_server" ]; then
    echo -e "${BLUE}  → Building C++ backend...${NC}"
    cd "$PROJECT_ROOT/backend"
    mkdir -p build && cd build
    cmake .. 2>&1 | tail -3
    cmake --build . -j$(nproc) 2>&1 | tail -5
    cd "$PROJECT_ROOT"
    echo -e "${GREEN}  ✓ C++ backend built successfully${NC}"
fi

cd "$PROJECT_ROOT/backend/build"
./task_server &
PID_BACKEND=$!
cd "$PROJECT_ROOT"
echo -e "${GREEN}  ✓ C++ Backend running (PID: $PID_BACKEND)${NC}"

# ============================================
# Service 2: Python AI Service (Port 8000)
# ============================================
echo -e "${CYAN}[2/3] Starting Python AI Service (FastAPI) on :8000...${NC}"

cd "$PROJECT_ROOT/ai-service"

# Create venv if it doesn't exist
if [ ! -d "venv" ]; then
    echo -e "${BLUE}  → Creating Python virtual environment...${NC}"
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt -q
else
    source venv/bin/activate
fi

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
PID_AI=$!
cd "$PROJECT_ROOT"
echo -e "${GREEN}  ✓ Python AI Service running (PID: $PID_AI)${NC}"

# ============================================
# Service 3: Axum Frontend (Port 3001)
# ============================================
echo -e "${CYAN}[3/3] Starting Axum Frontend (Rust) on :3001...${NC}"

cd "$PROJECT_ROOT/frontend"

if [ ! -f "target/debug/screenshot-graveyard-frontend" ] && [ ! -f "target/release/screenshot-graveyard-frontend" ]; then
    echo -e "${BLUE}  → Building Rust frontend (first build may take a few minutes)...${NC}"
    cargo build 2>&1 | tail -5
    echo -e "${GREEN}  ✓ Rust frontend built successfully${NC}"
fi

cargo run &
PID_FRONTEND=$!
cd "$PROJECT_ROOT"
echo -e "${GREEN}  ✓ Axum Frontend running (PID: $PID_FRONTEND)${NC}"

# ============================================
# Ready!
# ============================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ All services are running!               ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                              ║${NC}"
echo -e "${GREEN}║   🌐 Web UI:     http://localhost:3001       ║${NC}"
echo -e "${GREEN}║   🤖 AI API:     http://localhost:8000/docs  ║${NC}"
echo -e "${GREEN}║   ⚡ Backend:    http://localhost:8081/health ║${NC}"
echo -e "${GREEN}║                                              ║${NC}"
echo -e "${GREEN}║   Press Ctrl+C to stop all services          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Wait for any process to exit
wait
