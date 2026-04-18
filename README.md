# LearnTogether Monorepo (Vite + FastAPI + SQLite)

Monorepo with:

- `frontend/`: Vite + React (TypeScript), built and served by Nginx
- `backend/`: FastAPI + SQLite (SQLAlchemy), served by Uvicorn
- `docker-compose.yml`: run everything with Docker

## Product editions (lite vs full)

This project is split into **two publishable editions**. The intended model is **two builds, two deploys**: separate artifacts (and typically separate images or hosts) per edition, not one install that toggles features at runtime.

### LearnTogether Lite (current)

**Lite is the edition this repository implements today.** It includes everything currently documented and shipped here, for example:

- Check-ins, check-in window configuration, session classification (normal / late / leave / outside)
- Home (QR to `/join`, Zoom flow, daily hero image when configured, encourage copy)
- Members and badges
- Statistics
- Settings (check-in window, Zoom, optional daily hero API key, statistics options)
- Attendance import
- Progressive Web App (manifest + service worker) as configured in the frontend
- Deploy paths in this README (Docker, EC2 scripts)

### LearnTogether Full

**Full** builds add features on top of Lite. Implemented so far:

- **Learning goals** (`/learning-goals`): goal name, progress (derived from units when a positive total is set), optional **total / complete units**, optional **start date** and **deadline**, and a **behind-schedule** flag when “today” (in `CHECKIN_TZ`) would require more completed units on a linear plan than you have recorded (`GET/POST/PATCH/DELETE /api/learning-goals`). The backend requires `APP_EDITION=full`; the UI must be a **full** build (`VITE_EDITION=full`).

Still planned for Full:

- User **login** and authenticated sessions
- **Notifications** (e.g. push or email)
- Other full-only features as designed

#### How to build and run Full

- **Frontend** (from `frontend/`): `npm run build:full` or `npm run dev:full`. Files `frontend/.env.full`, `frontend/.env.lite`, `frontend/.env.development`, and `frontend/.env.lan` set `VITE_EDITION`. The default **`npm run build`** and Docker frontend build use **Lite** (`build:lite`).
- **Backend:** set `APP_EDITION=full` (see `backend/.env.example`). Learning goal APIs return **403** when the server is Lite.
- **Docker:** Compose uses `APP_EDITION` (default `lite`) and `BUILD_MODE` for the frontend image (default `lite`). Example full stack:

  ```bash
  APP_EDITION=full BUILD_MODE=full docker compose up --build
  ```

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
- Runs SQLite schema migration via [`scripts/db-migrate.sh`](scripts/db-migrate.sh) (backs up `backend/app.db` first)
- Builds frontend static files
- Configures `systemd` backend service and Nginx reverse proxy (`/api` -> backend)

To run the same migration on another machine (or locally), use `bash scripts/db-migrate.sh` from the repo root after `backend/.venv` exists; see comments in that file for `APP_ENV` / `CHECKIN_CONFIG_FILE` overrides.

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

It will pull latest code, refresh backend dependencies, run `scripts/db-migrate.sh`, rebuild frontend, and restart services.

## QR join + Zoom redirect

- Home page shows a QR code that points to `/join`
- `/join` asks for a nickname, saves it via `POST /api/checkins`, then redirects to Zoom

## Check-in time window (real check-ins)

Backend classifies each check-in into:
- `normal`: between `normal_start` and `normal_end` (start inclusive, end exclusive)
- `late`: between `normal_end` and `late_end` (inclusive)
- `leave`: explicit leave application from UI
- `outside`: outside configured windows

`normal` and `late` are treated as real check-ins.

- **This project default**: timezone `Asia/Tokyo`, normal `04:30`-`05:30`, late until `08:00`
- **Override timezone**: set `CHECKIN_TZ` (IANA name), e.g. `Asia/Tokyo`, `America/Los_Angeles`
- **Environment-based defaults**:
  - local: `backend/config/checkin_window.local.json` (near 24h)
  - production: `backend/config/checkin_window.production.json` (`04:30` - `08:00`)
- **Window config file (explicit override)**: set `CHECKIN_CONFIG_FILE` to point to a JSON file
  - `normal_start` (format `HH:MM`, 24-hour)
  - `normal_end` (format `HH:MM`, 24-hour)
  - `late_end` (format `HH:MM`, 24-hour)
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
  "normal_start": "00:10",
  "normal_end": "05:30",
  "late_end": "23:30"
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
python3 -m venv .venv
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

For **Full** UI (learning goals nav and `/learning-goals`), run `npm run dev:full` and set `APP_EDITION=full` in `backend/.env`.

If you run locally (without the Nginx proxy), set `VITE_API_BASE_URL=http://localhost:8000` to avoid calling the relative `/api`.

#### Progressive Web App (PWA)

The frontend uses [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) with a web app manifest (`manifest.webmanifest`), service worker, and PNG icons (`public/pwa-192.png`, `public/pwa-512.png`). In development, `devOptions.enabled` is on so you can test install and offline caching on **desktop Chrome** at `http://localhost:5173` (use the browser’s install / app menu when it appears).

**Commands**

| Command | Use case |
|--------|----------|
| `npm run dev` | Default dev server; good for **localhost** PWA testing. |
| `npm run dev:lan` | `vite --host 0.0.0.0 --mode lan`: listen on all interfaces so you can open **`http://<your-PC-LAN-IP>:5173`** from another device on the same Wi‑Fi (use the PC’s LAN IPv4 from `ipconfig` on Windows; on WSL use the **host** IP, not the `172.x` address inside Linux). |

HTTPS for the Vite dev server is **disabled** for now (plain HTTP only). **PWA install / service workers on a phone** usually need **HTTPS** or **localhost**; over `http://<LAN-IP>` the browser may not treat the page as a secure context, so test PWA install on **desktop** with `npm run dev`, or use **`npm run build`** + **`npm run preview`** behind HTTPS, or your deployed **Nginx** site.

**Production-style check**

```bash
cd frontend
npm run build
npm run preview -- --host 0.0.0.0
```

Then open the printed URL. Deployed sites behind **Nginx with HTTPS** behave like normal PWAs for end users.

