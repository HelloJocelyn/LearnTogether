# Study Intelligence Layer

A small **Python** service that turns study notes into structured knowledge, a **short daily plan** (by default two tasks), and **low-pressure reflections**. It is designed to reduce cognitive load, not to surface a full backlog. Product goals and constraints are documented in [`plan.md`](plan.md).

## Code layout

| Path | Role |
|------|------|
| [`agents/intake.py`](agents/intake.py) | Normalizes raw text into a topic + structured fields (LLM when `OPENAI_API_KEY` is set; simple heuristics otherwise). |
| [`agents/knowledge.py`](agents/knowledge.py) | Derives tags and a mastery estimate from intake + summary. |
| [`agents/planner.py`](agents/planner.py) | Builds today’s plan: up to `INTELLIGENCE_MAX_DAILY_TASKS` items, prioritizing overdue reviews and lower mastery. |
| [`agents/reflection.py`](agents/reflection.py) | Produces a short, stress-aware reflection (LLM or template). |
| [`memory/state_store.py`](memory/state_store.py) | SQLite persistence: knowledge rows, cached daily plans, reflections. |
| [`memory/vector_store.py`](memory/vector_store.py) | Optional semantic search over stored chunks (OpenAI embeddings + FAISS); falls back to lexical overlap without a key. |
| [`skills/summarizer.py`](skills/summarizer.py) | Short summaries (LLM or truncation). |
| [`skills/scheduler.py`](skills/scheduler.py) | Next review dates and suggested session lengths. |
| [`core/config.py`](core/config.py) | Environment-driven settings. |
| [`core/schemas.py`](core/schemas.py) | Shared Pydantic models (intake, plan, reflection). |
| [`core/llm.py`](core/llm.py) | OpenAI-compatible chat and embedding HTTP calls. |
| [`core/orchestrator.py`](core/orchestrator.py) | Wires agents, memory, and skills for ingest → plan → reflect. |
| [`main.py`](main.py) | FastAPI application. |
| [`cli.py`](cli.py) | Command-line interface. |

Runtime data defaults to `intelligence/data/study.db` and vector index files next to that path unless you override paths (see below).

## Requirements

- Python 3.9+ (tested with 3.9; newer versions work).
- Dependencies: see [`requirements.txt`](requirements.txt).

## Setup

From the **repository root** (`LearnTogether/`):

```bash
python3 -m venv intelligence/.venv
intelligence/.venv/bin/pip install -r intelligence/requirements.txt
export PYTHONPATH=.
```

`PYTHONPATH` must include the repo root so `python -m intelligence` resolves the package.

## Configuration (environment variables)

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | If set, intake, summarization, reflection, and embeddings use the OpenAI-compatible API. If unset, those steps use deterministic fallbacks. |
| `OPENAI_BASE_URL` | API base URL (default `https://api.openai.com/v1`). |
| `INTELLIGENCE_LLM_MODEL` | Chat model (default `gpt-4o-mini`). |
| `INTELLIGENCE_EMBEDDING_MODEL` | Embedding model (default `text-embedding-3-small`). |
| `INTELLIGENCE_DB_PATH` | SQLite file path (default `intelligence/data/study.db`). |
| `INTELLIGENCE_FAISS_PATH` | Base path for FAISS index + metadata files (default: next to the DB under `data/`). |
| `INTELLIGENCE_MAX_DAILY_TASKS` | Integer 1–3 (default `2`). |

## CLI

All commands assume `PYTHONPATH=.` from the repo root.

**Ingest text** (stdin or file):

```bash
echo "Notes on linear algebra..." | intelligence/.venv/bin/python -m intelligence input --source wechat_reading
intelligence/.venv/bin/python -m intelligence input -f ./notes.txt --source manual
```

**Show today’s plan** (optional date):

```bash
intelligence/.venv/bin/python -m intelligence plan
intelligence/.venv/bin/python -m intelligence plan --date 2026-04-02
```

**Reflection** (what felt easy or flowed):

```bash
intelligence/.venv/bin/python -m intelligence reflect "Matrix practice felt easy today."
intelligence/.venv/bin/python -m intelligence reflect -f reflection.txt
```

## HTTP API

Run Uvicorn from the repo root with `PYTHONPATH=.`:

```bash
intelligence/.venv/bin/uvicorn intelligence.main:app --host 127.0.0.1 --port 8081 --reload
```

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness; includes `"service": "intelligence"`. |
| `POST` | `/api/intelligence/input` | JSON body: `{ "text": "...", "source": "api" }`. Returns structured intake. |
| `GET` | `/api/intelligence/plan/today` | Query `day` optional (`YYYY-MM-DD`). Returns today’s plan. |
| `POST` | `/api/intelligence/reflection` | JSON body: `{ "what_felt_easy": "..." }`. Returns reflection text. |

OpenAPI docs: `http://127.0.0.1:8081/docs` (when the server is running).

## Data flow

```text
input (CLI/API)
  → Intake → Summarize → Knowledge upsert (SQLite) + vector chunk (FAISS / lexical)
plan
  → Planner reads knowledge → at most N tasks for the day
reflect
  → Reflection (optional LLM) → stored with today’s date
```

## See also

- [`plan.md`](plan.md) — product vision, agent roles, and design constraints.
