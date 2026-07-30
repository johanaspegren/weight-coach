#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_VENV="${WC_VENV:-}"
LOG_DIR="$ROOT_DIR/.run"
WITH_WEB=0
RELOAD=0
LAN=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [--with-web] [--lan] [--reload]

Starts the three weight-coach application processes:
  - api      FastAPI / uvicorn on WC_API_HOST:WC_API_PORT, default 127.0.0.1:8765
  - worker   APScheduler jobs
  - bot      Discord bot

Options:
  --with-web  Also start the Vite web UI from ./web
  --lan       Start the web UI on all interfaces so another LAN device can reach it
  --reload    Run the API with uvicorn reload enabled
  -h, --help  Show this help

Environment:
  WC_VENV     Optional path to the Python venv to use
  WC_WEB_HOST Optional Vite host, default 127.0.0.1 or 0.0.0.0 with --lan
  WC_WEB_PORT Optional Vite port, default 5173
EOF
}

is_port_open() {
  "$API_VENV/bin/python" - "$1" "$2" >/dev/null 2>&1 <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
    s.settimeout(0.5)
    raise SystemExit(0 if s.connect_ex((host, port)) == 0 else 1)
PY
}

print_port_in_use_help() {
  cat <<EOF
Port $WC_API_HOST:$WC_API_PORT is already in use.

On the RPi this is usually the user-mode systemd API service. Check with:
  systemctl --user status weight-coach-api.service
  systemctl --user status weight-coach-worker.service
  systemctl --user status weight-coach-bot.service

If the services are running, use them instead of this dev script. To update the UI:
  cd web && npm run build
  systemctl --user restart weight-coach-api.service

If you really want the dev script, stop the services first:
  systemctl --user stop weight-coach-api.service weight-coach-worker.service weight-coach-bot.service

To see what owns the port:
  ss -ltnp 'sport = :$WC_API_PORT'
EOF
}

lan_ip() {
  "$API_VENV/bin/python" - <<'PY'
import socket

try:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect(("8.8.8.8", 80))
        print(s.getsockname()[0])
except Exception:
    print("127.0.0.1")
PY
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-web)
      WITH_WEB=1
      shift
      ;;
    --lan)
      WITH_WEB=1
      LAN=1
      shift
      ;;
    --reload)
      RELOAD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$API_VENV" || ! -x "$API_VENV/bin/python" ]]; then
  for candidate in "$ROOT_DIR/.venv" "$ROOT_DIR/api/.venv"; do
    if [[ -x "$candidate/bin/python" ]] && "$candidate/bin/python" -c "import weight_coach, discord" >/dev/null 2>&1; then
      API_VENV="$candidate"
      break
    fi
  done
fi

if [[ -z "$API_VENV" || ! -x "$API_VENV/bin/python" ]]; then
  echo "Missing Python venv with weight-coach dependencies." >&2
  echo "Create one with: python -m venv .venv && source .venv/bin/activate && pip install -e ./api" >&2
  exit 1
fi

if ! "$API_VENV/bin/python" -c "import weight_coach, discord" >/dev/null 2>&1; then
  echo "Python venv is missing required packages: $API_VENV" >&2
  echo "Install them with: source $API_VENV/bin/activate && pip install -e ./api" >&2
  exit 1
fi

if [[ "$WITH_WEB" -eq 1 && ! -d "$ROOT_DIR/web/node_modules" ]]; then
  echo "Missing web/node_modules" >&2
  echo "Install web dependencies with: cd web && npm install" >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Warning: .env was not found. Copy env.example to .env and fill in credentials if processes fail." >&2
fi

mkdir -p "$LOG_DIR"

declare -a PIDS=()
declare -a NAMES=()

start_process() {
  local name="$1"
  shift
  local log_file="$LOG_DIR/$name.log"

  : > "$log_file"
  (
    cd "$ROOT_DIR"
    exec "$@"
  ) > "$log_file" 2>&1 &

  local pid=$!
  PIDS+=("$pid")
  NAMES+=("$name")
  echo "Started $name (pid $pid), logging to $log_file"
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local log_file="$LOG_DIR/$name.log"

  for _ in {1..20}; do
    if "$API_VENV/bin/python" - "$url" >/dev/null 2>&1 <<'PY'
import sys
import urllib.request

try:
    with urllib.request.urlopen(sys.argv[1], timeout=0.5) as response:
        if response.status < 500:
            raise SystemExit(0)
except Exception:
    pass

raise SystemExit(1)
PY
    then
      return 0
    fi
    sleep 0.25
  done

  echo "$name did not answer at $url. Last log lines:"
  tail -n 40 "$log_file" || true
  return 1
}

stop_all() {
  local pid
  echo
  echo "Stopping weight-coach processes..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}

trap stop_all INT TERM EXIT

export WC_API_HOST="${WC_API_HOST:-127.0.0.1}"
export WC_API_PORT="${WC_API_PORT:-8765}"
if [[ "$LAN" -eq 1 ]]; then
  export WC_WEB_HOST="${WC_WEB_HOST:-0.0.0.0}"
else
  export WC_WEB_HOST="${WC_WEB_HOST:-127.0.0.1}"
fi
export WC_WEB_PORT="${WC_WEB_PORT:-5173}"

echo "Using Python venv: $API_VENV"

if is_port_open "$WC_API_HOST" "$WC_API_PORT"; then
  print_port_in_use_help
  exit 1
fi

api_cmd=("$API_VENV/bin/python" -m uvicorn weight_coach.main:app --host "$WC_API_HOST" --port "$WC_API_PORT")
if [[ "$RELOAD" -eq 1 ]]; then
  api_cmd+=(--reload)
fi

start_process api "${api_cmd[@]}"
start_process worker "$API_VENV/bin/python" -m weight_coach.worker
start_process bot "$API_VENV/bin/python" -m weight_coach.bot

if [[ "$WITH_WEB" -eq 1 ]]; then
  start_process web npm --prefix "$ROOT_DIR/web" run dev
fi

wait_for_url api "http://$WC_API_HOST:$WC_API_PORT/health"
if [[ "$WITH_WEB" -eq 1 ]]; then
  wait_for_url web "http://127.0.0.1:$WC_WEB_PORT/"
fi

echo
if [[ "$WITH_WEB" -eq 1 ]]; then
  if [[ "$LAN" -eq 1 ]]; then
    echo "Open web UI from this machine: http://127.0.0.1:$WC_WEB_PORT"
    echo "Open web UI from LAN: http://$(lan_ip):$WC_WEB_PORT"
  else
    echo "Open web UI: http://127.0.0.1:$WC_WEB_PORT"
  fi
  echo "Vite logs: $LOG_DIR/web.log"
  echo "API endpoints: http://$WC_API_HOST:$WC_API_PORT"
else
  echo "API endpoints: http://$WC_API_HOST:$WC_API_PORT"
  echo "Web UI not started. Use: $(basename "$0") --with-web"
fi
echo "Press Ctrl-C to stop everything."
echo

while true; do
  for i in "${!PIDS[@]}"; do
    pid="${PIDS[$i]}"
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "${NAMES[$i]} exited. Last log lines:"
      tail -n 40 "$LOG_DIR/${NAMES[$i]}.log" || true
      exit 1
    fi
  done
  sleep 2
done
