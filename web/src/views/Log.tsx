import { useState } from "react";

import { LogCheckinSheet } from "./sheets/LogCheckinSheet";
import { LogMealSheet } from "./sheets/LogMealSheet";
import { LogWeightSheet } from "./sheets/LogWeightSheet";
import { LogWorkoutSheet } from "./sheets/LogWorkoutSheet";

type Kind = null | "meal" | "weight" | "workout" | "checkin";

const TILES: Array<{
  kind: Exclude<Kind, null>;
  icon: string;
  title: string;
  hint: string;
  color: string;
}> = [
  { kind: "meal", icon: "🍽", title: "Log meal", hint: "Photo, type, or template", color: "#34d399" },
  { kind: "weight", icon: "⚖️", title: "Log weight", hint: "Morning after loo", color: "#e5e7eb" },
  { kind: "workout", icon: "🏃", title: "Log workout", hint: "X-trainer, run, walk", color: "#60a5fa" },
  { kind: "checkin", icon: "🌙", title: "Nightly check-in", hint: "What went into the day", color: "#a78bfa" },
];

export function Log() {
  const [open, setOpen] = useState<Kind>(null);
  return (
    <>
      <h1>Quick log</h1>
      <div className="log-grid">
        {TILES.map((t) => (
          <button
            key={t.kind}
            className="log-tile"
            onClick={() => setOpen(t.kind)}
            style={{ borderColor: `${t.color}33` }}
          >
            <div className="log-tile-icon" style={{ color: t.color }}>{t.icon}</div>
            <div>
              <div className="log-tile-title">{t.title}</div>
              <div className="log-tile-hint">{t.hint}</div>
            </div>
          </button>
        ))}
      </div>

      <LogMealSheet open={open === "meal"} onClose={() => setOpen(null)} />
      <LogWeightSheet open={open === "weight"} onClose={() => setOpen(null)} />
      <LogWorkoutSheet open={open === "workout"} onClose={() => setOpen(null)} />
      <LogCheckinSheet open={open === "checkin"} onClose={() => setOpen(null)} />
    </>
  );
}
