# Deploy — Linux user-mode systemd

Assumes the repo is at `~/dev/weight-coach` and the venv is set up:

```bash
cd ~/dev/weight-coach/api
python -m venv .venv
source .venv/bin/activate
pip install -e .
cd ../web && npm install && npm run build
```

## Run on boot

User-mode systemd is the cleanest fit — no `sudo`, per-user isolation, easy `journalctl` access.

```bash
# 1. Install the four unit files
mkdir -p ~/.config/systemd/user
cp deploy/weight-coach-*.service deploy/weight-coach-*.timer ~/.config/systemd/user/
systemctl --user daemon-reload

# 2. Enable + start everything
systemctl --user enable --now \
    weight-coach-api.service \
    weight-coach-worker.service \
    weight-coach-bot.service \
    weight-coach-backup.timer

# 3. Keep user services alive after logout / at boot without a login
sudo loginctl enable-linger $USER
```

Without `enable-linger`, user services stop when you log out and only restart when you next log in over SSH. With it, systemd keeps them running from boot regardless of who's logged in — this is what you want on a headless RPi.

Reboot the Pi to verify:
```bash
sudo reboot
# after it comes back:
systemctl --user status weight-coach-api weight-coach-worker weight-coach-bot
```

All three should be `active (running)`.

The API service also serves the built web UI and listens on all LAN interfaces.
From another device on the same network, open:

```text
http://<rpi-lan-ip>:8765/
```

## Check status / follow logs

```bash
systemctl --user status weight-coach-api.service
systemctl --user status weight-coach-worker.service
systemctl --user status weight-coach-bot.service

# Follow live logs from any service:
journalctl --user -u weight-coach-worker.service -f
journalctl --user -u weight-coach-bot.service -f

# See the last N lines including crashes:
journalctl --user -u weight-coach-api.service -n 200 --no-pager
```

## After a code change

```bash
cd ~/dev/weight-coach
git pull                       # or scp files across
source api/.venv/bin/activate
pip install -e ./api           # if dependencies changed
systemctl --user restart weight-coach-api weight-coach-worker weight-coach-bot
```

If the UI changed:
```bash
cd ~/dev/weight-coach/web && npm run build
systemctl --user restart weight-coach-api    # picks up new static files
```

If a unit file changed:
```bash
cd ~/dev/weight-coach
cp deploy/weight-coach-*.service deploy/weight-coach-*.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user restart weight-coach-api weight-coach-worker weight-coach-bot
```

## Generating VAPID keys (only needed if you use browser Web Push instead of Discord)

```bash
cd web && npx web-push generate-vapid-keys
```

Paste the two keys into `.env` as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, restart the api + worker.
