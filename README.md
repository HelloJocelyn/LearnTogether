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

## Deploy on one EC2 instance (without Docker)

This repo includes a native deployment script for running frontend + backend on the same EC2 host:

```bash
bash deploy-ec2.sh
```

What it does:

- Installs required packages (`python3`, `pip`, `node`, `npm`, `nginx`, `git`)
- Creates `.env.ec2` on first run (default `CHECKIN_TZ=Asia/Tokyo`)
- Pulls latest `main`
- Creates backend virtualenv and installs Python dependencies
- Builds frontend static files
- Configures `systemd` backend service and Nginx reverse proxy (`/api` -> backend)

After deploy:

- Website: `http://<EC2_PUBLIC_IP>:80`
- API health: `http://<EC2_PUBLIC_IP>:80/api/health`

Notes:

- Open inbound security-group rules for the frontend port (default TCP 80)
- Backend is bound to `127.0.0.1:8000` and is proxied by Nginx at `/api`
- Amazon Linux is supported explicitly; script installs Node.js 20+ automatically

### Update after code changes (EC2)

After the first deployment, use this one-command update script:

```bash
bash update-ec2.sh
```

It will pull latest code, rebuild frontend, refresh backend dependencies, and restart services.

## QR join + Zoom redirect

- Home page shows a QR code that points to `/join`
- `/join` asks for a nickname, saves it via `POST /api/checkins`, then redirects to Zoom

## Check-in time window (real check-ins)

Backend marks a check-in as **real** only if it happens within the configured time window (inclusive), in the configured timezone.

- **This project default**: timezone `Asia/Tokyo`, window `04:30` to `06:00`
- **Override timezone**: set `CHECKIN_TZ` (IANA name), e.g. `Asia/Tokyo`, `America/Los_Angeles`
- **Environment-based defaults**:
  - local: `backend/config/checkin_window.local.json` (near 24h)
  - production: `backend/config/checkin_window.production.json` (`04:30` - `08:00`)
- **Window config file (explicit override)**: set `CHECKIN_CONFIG_FILE` to point to a JSON file
  - `start` (format `HH:MM`, 24-hour)
  - `end` (format `HH:MM`, 24-hour)
- **Environment selector**: set `APP_ENV` to `local` or `production` (default: `local`)

### Daily hero image (OpenAI, optional)

If `OPENAI_API_KEY` is set, the backend generates one calm study-themed wide illustration per calendar day (using `CHECKIN_TZ`), caches the PNG under `backend/data/daily_hero/`, and the Home page shows it instead of the cat. Without the key, the cat image remains.

Optional: `OPENAI_IMAGE_MODEL` (e.g. `gpt-image-1` or `dall-e-3`), `OPENAI_CHAT_MODEL` (default `gpt-4o-mini`), `DAILY_HERO_DIR` (override storage path).

Example:

```bash
export CHECKIN_TZ=Asia/Tokyo
export APP_ENV=local
export CHECKIN_CONFIG_FILE=./config/checkin_window.local.json
```

`backend/config/checkin_window.local.json`:

```json
{
  "start": "00:10",
  "end": "23:30"
}
```

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
cp .env.example .env   # optional; edit .env for OPENAI_API_KEY, CHECKIN_TZ, etc.
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend loads environment variables from `backend/.env` (see `backend/.env.example`). `backend/.env` is gitignored.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

If you run locally (without the Nginx proxy), set `VITE_API_BASE_URL=http://localhost:8000` to avoid calling the relative `/api`.

