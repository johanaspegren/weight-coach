# Deploy — Linux system-mode systemd (RPi)

Assumes:
- Repo at `/home/pi/dev/weight-coach` (adjust unit files if your user isn't `pi`)
- Venv at `api/.venv/`
- `.env` at repo root

```bash
cd ~/dev/weight-coach/api
python -m venv .venv
source .venv/bin/activate
pip install -e .
cd ../web && npm install && npm run build
```

## Run on boot (system services — reliable on headless Pi)

These are **system-scoped** units (like bus-watchdog), not user-scoped. This is important on Raspberry Pi OS where user-mode systemd sometimes fails to come up cleanly at boot.

```bash
# 1. Install unit files
sudo cp deploy/weight-coach-*.service deploy/weight-coach-*.timer /etc/systemd/system/
sudo systemctl daemon-reload

# 2. Enable + start everything
sudo systemctl enable --now \
    weight-coach-api.service \
    weight-coach-worker.service \
    weight-coach-bot.service \
    weight-coach-backup.timer
```

Reboot to verify:
```bash
sudo reboot
# after it comes back:
sudo systemctl status weight-coach-api weight-coach-worker weight-coach-bot
```

All three should be `active (running)`.

## Migrating from the old user-mode setup

If you previously enabled these under `systemctl --user`, disable them first:

```bash
systemctl --user disable --now weight-coach-api weight-coach-worker weight-coach-bot weight-coach-backup.timer 2>/dev/null || true
rm -f ~/.config/systemd/user/weight-coach-*.service ~/.config/systemd/user/weight-coach-*.timer
systemctl --user daemon-reload
# Optional (only if nothing else needs it):
# sudo loginctl disable-linger $USER
```

Then follow the "Run on boot" steps above.

## Check status / follow logs

```bash
sudo systemctl status weight-coach-api.service
sudo systemctl status weight-coach-worker.service
sudo systemctl status weight-coach-bot.service

# Follow live logs from any service:
sudo journalctl -u weight-coach-worker.service -f
sudo journalctl -u weight-coach-bot.service -f

# See the last N lines including crashes:
sudo journalctl -u weight-coach-api.service -n 200 --no-pager
```

Also file-based logs at `.run/*.log` inside the repo:
```bash
tail -n 200 ~/dev/weight-coach/.run/api.log
tail -n 200 ~/dev/weight-coach/.run/worker.log
tail -n 200 ~/dev/weight-coach/.run/bot.log
```

## After a code change

```bash
cd ~/dev/weight-coach
git pull
source api/.venv/bin/activate
pip install -e ./api    # if dependencies changed
sudo systemctl restart weight-coach-api weight-coach-worker weight-coach-bot
```

If the UI changed:
```bash
cd ~/dev/weight-coach/web && npm run build
sudo systemctl restart weight-coach-api
```

If a unit file changed:
```bash
cd ~/dev/weight-coach
sudo cp deploy/weight-coach-*.service deploy/weight-coach-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart weight-coach-api weight-coach-worker weight-coach-bot
```

## Generating VAPID keys (only needed for browser Web Push — Discord is easier)

```bash
cd web && npx web-push generate-vapid-keys
```

Paste into `.env` as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, restart api + worker.
