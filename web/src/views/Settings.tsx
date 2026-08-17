import { useState } from "react";
import toast from "react-hot-toast";

import { Card } from "../components/Card";
import { subscribePush } from "../services/push";
import { useSyncGarmin, useSyncOura } from "../services/queries";

export function Settings() {
  const syncGarmin = useSyncGarmin();
  const syncOura = useSyncOura();
  const [pushMsg, setPushMsg] = useState("");

  const enablePush = async () => {
    try {
      setPushMsg(await subscribePush());
    } catch (e) {
      setPushMsg((e as Error).message);
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <h1>Settings</h1>

      <Card title="Wearable sync">
        <button
          className="ghost"
          onClick={() => syncGarmin.mutate()}
          disabled={syncGarmin.isPending}
        >
          {syncGarmin.isPending ? "Syncing…" : "Sync Garmin now"}
        </button>
        <button
          className="ghost"
          style={{ marginTop: 8 }}
          onClick={() => syncOura.mutate()}
          disabled={syncOura.isPending}
        >
          {syncOura.isPending ? "Syncing…" : "Sync Oura now"}
        </button>
        <div className="muted" style={{ marginTop: 8 }}>
          The worker also polls Garmin every 20 min automatically.
        </div>
      </Card>

      <Card title="Notifications">
        <button className="ghost" onClick={enablePush}>
          Enable 23:00 push
        </button>
        <div className="muted">{pushMsg}</div>
        <div className="muted" style={{ marginTop: 8 }}>
          Or use the Discord bot for the nightly nudge — it works everywhere without HTTPS.
        </div>
      </Card>

      <Card title="Data">
        <a href="/data/export.json" className="ghost small" style={{ display: "inline-block" }}>
          Download JSON
        </a>
        <a
          href="/data/export.csv.zip"
          className="ghost small"
          style={{ display: "inline-block", marginLeft: 6 }}
        >
          Download CSV zip
        </a>
      </Card>

      <Card title="About">
        <div className="muted">weight-coach · React + FastAPI · SQLite</div>
      </Card>
    </>
  );
}
