# Deploy — Linux user-mode systemd

Assumes the repo lives at `~/dev/weight-coach` and you've created the venv:

```bash
cd ~/dev/weight-coach/api
python -m venv .venv
source .venv/bin/activate
pip install -e .
cd ../web && npm install && npm run build
```

Install the units:

```bash
mkdir -p ~/.config/systemd/user
cp deploy/weight-coach-*.service deploy/weight-coach-*.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now weight-coach-api.service weight-coach-worker.service weight-coach-backup.timer
loginctl enable-linger $USER   # so units keep running when you're logged out
```

Check status:

```bash
systemctl --user status weight-coach-api.service weight-coach-worker.service
journalctl --user -u weight-coach-worker.service -f
```

## Generating VAPID keys

```bash
cd web && npx web-push generate-vapid-keys
```

Paste the two keys into `.env` as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, restart the api + worker.
