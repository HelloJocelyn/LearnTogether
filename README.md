# LearnTogether Monorepo (Vite + FastAPI + SQLite)

Monorepo with:

- `frontend/`: Vite + React (TypeScript), built and served by Nginx
- `backend/`: FastAPI + SQLite (SQLAlchemy), served by Uvicorn
- `docker-compose.yml`: run everything with Docker

## Quickstart (Docker)

```bash
docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- API health: `http://localhost:8000/api/health`

The frontend proxies `/api` to the backend via Nginx, so the UI calls the backend using a relative `/api/...` URL (no CORS setup needed).

## QR join + Zoom redirect

- Home page shows a QR code that points to `/join`
- `/join` asks for a nickname, saves it via `POST /api/checkins`, then redirects to Zoom

Configure the Zoom meeting URL for the frontend:

```bash
cd frontend
echo 'VITE_ZOOM_MEETING_URL=https://zoom.us/j/your_meeting_id' > .env.local
```

## Local dev (without Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

If you run locally (without the Nginx proxy), set `VITE_API_BASE_URL=http://localhost:8000` to avoid calling the relative `/api`.

