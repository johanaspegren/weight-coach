# weight-coach

Personal AI-assisted weight & habit tracker. Runs on your own Linux box.

**Stack:** Python venv (FastAPI + APScheduler + SQLite) · npm/Vite PWA · systemd · Ollama (later) · Anthropic API (later).

**Data sources:** Oura ring · smart scale (abstracted; starts manual) · nightly text check-in about the day's food.

## Phase 1 (this scaffold)

- FastAPI + SQLite with `daily`, `oura_raw`, `meals`, `checkins`, `coach_notes`, `meal_templates`, `push_subs` tables
- Oura daily poller
- Manual weight entry endpoint
- Free-text nightly check-in stored raw (LLM parsing comes in Phase 2)
- PWA shell with Web Push subscription and a 23:00 notification
- Two systemd units (api, worker) + nightly SQLite backup timer

## Quick start (dev)

```bash
# API
cd api
python -m venv .venv && source .venv/bin/activate
pip install -e .
cp ../.env.example ../.env         # then edit
python -m weight_coach.migrate     # create tables
uvicorn weight_coach.main:app --reload --port 8765

# Worker (separate terminal)
source api/.venv/bin/activate
python -m weight_coach.worker

# Web
cd web
npm install
npm run dev
```

## Deploy (Linux + systemd)

See `deploy/` — copy the three units to `~/.config/systemd/user/` and
`systemctl --user enable --now weight-coach-api.service weight-coach-worker.service weight-coach-backup.timer`.
