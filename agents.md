# LearnTogether — agent context

This file summarizes **architecture** and **implemented features** so assistants can work on the repo without rediscovering layout and behavior.

## Purpose

LearnTogether is a small web app for a study group: **QR-based join**, **check-ins** with time-window rules, **member roster**, **statistics**, optional **daily hero image** (OpenAI), and **attendance import** (upload flow with mocked OCR).

## Repository layout

| Area | Role |
|------|------|
| `frontend/` | Vite + React + TypeScript, React Router, client `fetch` API wrapper in `src/api.ts`, i18n in `src/i18n.tsx` (English, Chinese, Japanese). |
| `backend/` | FastAPI app in `app/main.py`, SQLAlchemy models in `app/models.py`, persistence in `app/crud.py`, SQLite via `app/db.py`. |
| `backend/config/` | JSON check-in window configs (`checkin_window.local.json`, `checkin_window.production.json`, optional `checkin_window.json`). |
| `docker-compose.yml` | Orchestrates `frontend` (Nginx serving static build) and `backend` (Uvicorn), with a named volume for SQLite when using Docker. |
| `deploy-ec2.sh` / `update-ec2.sh` | Native EC2 deployment: systemd backend, Nginx reverse proxy, Node build. |
| `intelligence/ontology/` | Standalone JSON ontology sketch (`learning_ontology.json`); not wired into the running app. |

## Runtime topology

- **Docker**: Frontend container listens on **5173→80**; backend **8000**. Nginx in the frontend image proxies `/api/` to `http://backend:8000` (see `frontend/nginx.conf`). SQLite path in compose: `DATABASE_URL=sqlite:////data/app.db` with volume `backend_data:/data`.
- **Local dev**: Backend defaults to `sqlite:///./app.db` next to the backend tree; load `backend/.env` (see `backend/.env.example`). Frontend uses relative `/api` when `VITE_API_BASE_URL` is unset (works behind Nginx); for direct backend calls set `VITE_API_BASE_URL=http://localhost:8000`.
- **EC2**: Single host: Nginx on port 80 forwards `/api` to backend on `127.0.0.1:8000`.

## Backend architecture

- **Framework**: FastAPI; CORS is permissive for local dev.
- **Startup**: `init_db()` creates tables and applies **lightweight SQLite migrations** (ALTER TABLE for older `checkins` columns).
- **Check-in window configuration** (`app/checkin_config.py`):
  - Resolved path: `CHECKIN_CONFIG_FILE`, else `APP_ENV` selects `checkin_window.production.json` vs `checkin_window.local.json`.
  - Fields: `normal_start`, `normal_end`, `late_end` (HH:MM). Persisted edits via API must satisfy `normal_start < normal_end < late_end`.
  - Timezone for “local day” and classification: **`CHECKIN_TZ`** (IANA), e.g. `Asia/Tokyo`.
- **Check-in logic** (`app/crud.py`):
  - Status: `normal` | `late` | `leave` | `outside`. **`normal` and `late` count as “real”** (`is_real`).
  - **Duplicate rule**: At most one check-in per **nickname per local calendar day**; repeats return the earliest row (status may be refreshed if not `leave`).
  - Explicit **leave** is requested from the client (`status: leave` on create); otherwise status is derived from current local time vs window.
- **Daily hero** (`app/daily_hero_service.py`): If `OPENAI_API_KEY` is set, generates one row per local day (`CHECKIN_TZ`), stores PNG under `DAILY_HERO_DIR` (default `backend/data/daily_hero/`), metadata in `daily_heroes` table. Exposed as `GET /api/daily-hero` and `GET /api/daily-hero/image`. Without the key, the UI falls back to a static cat image.
- **Attendance import**: `POST /api/attendance-imports/ocr` accepts an image; **OCR is currently mocked** (`main.py` uses filename heuristics, not vision OCR). Flow: draft import → edit items → confirm (counts only; status becomes `confirmed`).
- **Members**: `members.name` is **unique** among active rows. Creation enforces **three whitespace-separated parts**: `"nickname role goal"`. Delete is **soft** (`is_active = false`).
- **Legacy/demo**: `GET/POST /api/items` remains for a simple `Item` entity (title).

## Data model (SQLite / SQLAlchemy)

- `items` — demo list items.
- `checkins` — `nickname`, `created_at` (UTC), `is_real`, `status`, `checkin_date_local` (YYYY-MM-DD in `CHECKIN_TZ`).
- `members` — `name`, `is_active`, `created_at`.
- `attendance_imports` / `attendance_import_items` — import batches and per-name attendance lines (`attended` | `not_attended` | `unknown`).
- `daily_heroes` — one hero per `hero_date_local`, copy + image filename.

## API surface (high level)

| Prefix | Purpose |
|--------|---------|
| `/api/health` | Liveness. |
| `/api/checkins` | List (filters: limit, `real_only`, `today_only`, date range) and create. |
| `/api/members` | List active, create, delete (deactivate). |
| `/api/settings/checkin-window` | GET/PUT window JSON (also reflects `APP_ENV` and resolved config path). |
| `/api/daily-hero`, `/api/daily-hero/image` | Today’s hero metadata and PNG. |
| `/api/attendance-imports/...` | OCR upload, get, update draft items, confirm. |
| `/api/items` | Simple CRUD list. |

## Frontend features

- **Routes** (`App.tsx`): `/` Home, `/join` Join, `/statistics`, `/members`, `/settings`, `/attendance/import`. Unknown paths redirect to `/`.
- **Home**: Check-in, member picker / registration (three-part name), optional daily hero, links to Zoom via `VITE_ZOOM_MEETING_URL` (default placeholder URL if unset). Displays recent check-ins and join QR behavior per product docs in `README.md`.
- **Join**: Lightweight path: nickname → `POST /api/checkins` → redirect to Zoom.
- **Statistics**: Uses check-in listing / analytics components for ranges and “today” views (see `CheckinAnalytics.tsx`).
- **Settings**: Edits check-in window through the API (writes the resolved JSON file on the server).
- **Attendance import**: Uploads image to OCR endpoint; user can revise rows before confirm.

## Environment variables (non-exhaustive)

- Backend: `DATABASE_URL`, `CHECKIN_TZ`, `APP_ENV`, `CHECKIN_CONFIG_FILE`, `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `OPENAI_CHAT_MODEL`, `DAILY_HERO_DIR`.
- Frontend: `VITE_API_BASE_URL`, `VITE_ZOOM_MEETING_URL`, `VITE_CHECKIN_TZ` (display).

## Conventions worth preserving

- API responses and types in `frontend/src/api.ts` should stay aligned with `backend/app/schemas.py`.
- Check-in date filtering uses both stored `checkin_date_local` and UTC `created_at` for compatibility (see `list_checkins_range` in `crud.py`).
- Prefer **minimal, task-scoped changes**; avoid unrelated refactors unless requested.

When in doubt, **`README.md`** has user-facing setup, deploy, and check-in window documentation; this file is the **machine-oriented** counterpart for agents.
