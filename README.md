# weight-coach

Personal AI-assisted weight and habit tracker. Runs on your own hardware, no cloud dependencies for the coaching loop.

**Stack**

- Python venv (FastAPI + APScheduler + SQLite) — the API, scheduler, and Discord bot
- npm / Vite PWA — LAN-only web UI for charts and drilldowns
- Ollama (on a beefier machine) — local LLM for meal-macro estimation
- Anthropic / OpenAI (optional) — cloud fallback and future weekly coach
- systemd — three units on the always-on host (`api`, `worker`, `bot`) + a nightly backup timer

**Data sources**

- **Oura ring** — daily readiness, sleep score, HRV, activity kcal, workouts, stress, resilience, vO₂ max, tags. Polled every morning; manual `Sync Oura now` button in the PWA.
- **Cleverio Wifi Scale 2** (via Tuya Cloud) — weight + raw body-composition properties, polled every 5 min from the device shadow.
- **Manual** — weight, meals, workouts, freetext nightly check-in via PWA or Discord slash commands.

**Interaction layer**

- **PWA** on your LAN for dashboard, drilldown per day, and analytics
- **Discord bot** for mobile logging anywhere: `/weight`, `/log`, `/workout`, `/status`, plus a nightly 23:00 DM nudge

## Architecture (target)

```
┌──────────────────────────────┐    ┌───────────────────────┐
│  RPi 4 (always on, ~4W)      │    │  homeAI (on-demand)   │
│                              │    │                       │
│  • FastAPI (LAN web UI)      │───►│  • Ollama             │
│  • APScheduler worker        │    │    (qwen2.5:7b)       │
│  • Discord bot               │    │                       │
│  • SQLite                    │    └───────────────────────┘
│                              │             ↑
│  Falls back to OpenAI when   │             │
│  homeAI is unreachable       │             │ LAN
└──────────────────────────────┘             │
        ↑                    ↑               │
        │ LAN browser        │ Discord Gateway
        │ (charts)           │ (meal logs, /weight, /status)
        │                    │
        └───── phone/laptop ─┘
```

For local development everything can run on one Mac; the Pi is just the eventual deployment target.

## Feature status

**Built**

- Data ingestion: Oura, Tuya scale, manual weight/meal/workout, freetext check-in
- Meal estimator with template cache → Ollama → OpenAI → deferred, backfilled hourly
- Dashboard: today In/Out/Net, week net, cumulative deficit, predicted vs actual kg, latest weight
- Per-day drilldown with all Oura fields, meals with macros, workouts, and raw scale properties
- Web Push at 23:00 (browser)
- Discord bot with slash commands + nightly DM nudge
- BMR-based Out fallback for days without Oura
- Three systemd units + nightly SQLite backup
- macOS + Zscaler compatibility via `truststore.inject_into_ssl()`

**Not yet (roadmap)**

- LLM parsing of the full nightly check-in transcript (currently stored raw)
- Meal template quick-picks surfaced in the UI
- 14-day maintenance recalibration loop (`MAINTENANCE_KCAL` is dormant)
- Weekly Anthropic coach summary
- Charts: weight trend, cumulative deficit line, macro/food-group drilldown
- Running-plan module (Oura readiness–gated progression)
- Withings support if the scale is upgraded later

## Layout

```
weight-coach/
├── api/
│   ├── pyproject.toml
│   └── src/weight_coach/
│       ├── main.py               # FastAPI app
│       ├── worker.py             # APScheduler: Oura sync, checkin push, backfill, Tuya poll
│       ├── bot.py                # Discord bot (slash commands + 23:00 DM)
│       ├── config.py             # pydantic-settings, reads .env at repo root
│       ├── db.py                 # SQLite schema + idempotent column migrations
│       ├── http.py               # truststore.inject_into_ssl() bootstrap
│       ├── push_send.py          # Web Push fan-out
│       ├── models.py             # Pydantic request models
│       ├── providers/
│       │   ├── oura.py           # Oura v2 poller (readiness, sleep, activity, workouts, stress, resilience, vO2, tags)
│       │   ├── oura_debug.py     # one-shot diagnostic script
│       │   ├── tuya.py           # Cleverio scale via shadow properties
│       │   ├── tuya_debug.py     # one-shot diagnostic script
│       │   ├── estimator.py      # meal-macro LLM chain (template → Ollama → OpenAI → pending)
│       │   ├── ble_scan.py       # BLE scanner used during scale investigation
│       └── routes/               # weight, meal, workout, checkin, daily, oura, tuya, push
├── web/                          # Vite PWA
├── data/                         # SQLite DB + nightly backups
├── deploy/                       # systemd units for Linux
└── env.example                   # copy to `.env` and fill in
```

## Quick start (dev, macOS or Linux)

```bash
# API
cd api
python -m venv .venv && source .venv/bin/activate
pip install -e .
cp ../env.example ../.env         # then edit
python -m weight_coach.migrate    # create tables

python -m uvicorn weight_coach.main:app --reload --port 8765

# Worker (separate shell)
source api/.venv/bin/activate
python -m weight_coach.worker

# Discord bot (separate shell)
source api/.venv/bin/activate
python -m weight_coach.bot

# Web
cd web && npm install && npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

Or start the three application services together from the repo root:

```bash
scripts/start-dev.sh
```

Use `scripts/start-dev.sh --with-web` to start the Vite UI too, or add `--reload` for API hot reload. Logs are written to `.run/`.

## Deploy (Linux + systemd, e.g. RPi)

See [`deploy/README.md`](deploy/README.md) — three user-mode services (`api`, `worker`, `bot`) + a nightly SQLite backup timer, plus the one-liner (`sudo loginctl enable-linger $USER`) that makes them survive reboots on a headless Pi.


## Restart the Rpi server

```bash
# on the RPi the app should run as systemd services, and start-dev.sh will refuse to start if the API port is already occupied.

cd ~/dev/weight-coach
git pull

# If the web UI changed, build it first:
cd ~/dev/weight-coach/web
npm install
npm run build

sudo systemctl restart weight-coach-api weight-coach-worker weight-coach-bot


```

## Mobile / remote access — Tailscale

The PWA is served on the Pi's LAN, so straight out of the box it only works when the phone is on your home WiFi. To reach it from anywhere (4G, hotels, coffee shops) without exposing the Pi to the public internet, run **Tailscale** on both the Pi and your phone. Traffic goes over an encrypted WireGuard mesh; nothing is publicly reachable.

Setup (~10 min):

```bash
# on the Pi
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

- Sign in via the printed URL (free personal plan)
- Install the Tailscale app on your Android phone with the same account
- On the Tailscale admin console (`https://login.tailscale.com/admin/dns`) enable **MagicDNS** and **HTTPS Certificates**

Issue a Let's Encrypt cert on the Pi:

```bash
sudo tailscale cert hallway-server.tail7bd556.ts.net   # substitute your machine's FQDN
sudo mkdir -p /etc/tailscale-certs
sudo mv hallway-server.tail7bd556.ts.net.* /etc/tailscale-certs/
sudo chown pi:pi /etc/tailscale-certs/*
sudo chmod 640 /etc/tailscale-certs/*
```

Update `deploy/weight-coach-api.service` `ExecStart` to serve HTTPS on 8443:

```
ExecStart=/home/pi/dev/weight-coach/api/.venv/bin/uvicorn weight_coach.main:app \
    --host 0.0.0.0 --port 8443 \
    --ssl-certfile /etc/tailscale-certs/hallway-server.tail7bd556.ts.net.crt \
    --ssl-keyfile  /etc/tailscale-certs/hallway-server.tail7bd556.ts.net.key
```

Renewal — Let's Encrypt certs expire every 90 days, so add a monthly cron on the Pi (`sudo crontab -e`):

```
0 3 1 * *  /usr/bin/tailscale cert --cert-file /etc/tailscale-certs/hallway-server.tail7bd556.ts.net.crt --key-file /etc/tailscale-certs/hallway-server.tail7bd556.ts.net.key hallway-server.tail7bd556.ts.net && systemctl restart weight-coach-api
```

Bookmark on the phone: `https://hallway-server.tail7bd556.ts.net:8443/` → Chrome menu → **Add to Home Screen**. From then on you tap an icon; the ugly URL is invisible.

**Note on Tailscale + Certificate Transparency:** the machine's FQDN gets published to public CT logs (a Let's Encrypt requirement). The `tail7bd556` suffix is deliberately obfuscated by Tailscale so it doesn't leak your identity, but avoid embarrassing hostnames. Nothing about traffic or content is exposed — only the name is public. If this matters, plain HTTP over Tailscale is a valid alternative since Tailscale itself is WireGuard-encrypted end-to-end.

## Configuration cheatsheet (`.env`)

| Key                                                                          | What it does                                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `WC_DB_PATH`                                                               | SQLite path (default`./data/weight.db`)                                                   |
| `WC_API_HOST`, `WC_API_PORT`                                             | Where uvicorn binds                                                                         |
| `PROGRAM_START`                                                            | Anchors cumulative deficit calculations                                                     |
| `MAINTENANCE_KCAL`                                                         | Starting guess for TDEE (dormant, will be recalibrated in Phase 3)                          |
| `BMR_KCAL`                                                                 | Used for "Out" fallback when Oura data is absent                                            |
| `OURA_TOKEN`                                                               | Oura personal access token — grant**all scopes**                                     |
| `TUYA_ENDPOINT`                                                            | Tuya cloud data center (Central Europe =`https://openapi.tuyaeu.com` for Nordic accounts) |
| `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_DEVICE_ID`, `TUYA_UID` | Tuya IoT Cloud project + scale                                                              |
| `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_ALT_URL`, `OLLAMA_ALT_MODEL`         | Local LLM for meal estimation; try primary first, then one optional alternative host/model |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`                    | Cloud fallback for meal estimation                                                          |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`               | Web Push for the browser 23:00 nudge (optional if you use Discord)                          |
| `DISCORD_TOKEN`, `DISCORD_USER_ID`, `DISCORD_GUILD_ID`                 | Discord bot                                                                                 |
| `CHECKIN_HOUR`, `CHECKIN_MINUTE`                                         | Time for the 23:00 DM/push                                                                  |

## Data export / import

The PWA has a `Data` screen with:

- JSON export — the restorable backup format
- CSV zip export — one CSV per table plus a manifest, for spreadsheet inspection
- JSON import — merge by primary key by default, with an optional replace mode

JSON exports include a manifest with export version, table columns, primary keys, and rows. Import is intentionally version-tolerant: unknown tables and columns are ignored, and columns added by newer app versions can stay empty/defaulted when importing older exports.

## macOS + Zscaler note

Behind Zscaler (or any corporate TLS-inspection proxy) Python's default certifi CA bundle fails. This project uses [`truststore`](https://pypi.org/project/truststore/) and calls `truststore.inject_into_ssl()` at process start in both the API, worker, and bot — this makes Python use the OS keychain, which already trusts Zscaler.
