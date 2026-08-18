import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Card } from "../components/Card";
import { getDetail } from "../services/api";
import { todayISO } from "../services/dates";
import type { DailyDetail } from "../services/types";

type Row = [string, string] | [string, string, string];

function KVList({ obj, rows }: { obj: object | null | undefined; rows: Row[] }) {
  if (!obj) return <div className="muted">no data</div>;
  const bag = obj as Record<string, unknown>;
  const shown = rows.filter(([k]) => bag[k] !== null && bag[k] !== undefined);
  if (!shown.length) return <div className="muted">no data</div>;
  return (
    <>
      {shown.map(([k, label, suffix = ""]) => (
        <div key={k} className="kv">
          <div className="k">{label}</div>
          <div className="v">
            {String(bag[k])}
            {suffix}
          </div>
        </div>
      ))}
    </>
  );
}

interface ScaleBlob {
  read_at?: string;
  weight_kg?: number | null;
  properties?: Array<{ code?: string; value?: unknown; type?: string; time?: number; dp_id?: number }>;
}

function ScaleCard({ scaleJson }: { scaleJson: string | null | undefined }) {
  if (!scaleJson) return null;
  let s: ScaleBlob;
  try {
    s = JSON.parse(scaleJson);
  } catch {
    return null;
  }
  const props = (s.properties ?? []).filter(
    (p) => p.value !== null && p.value !== undefined && p.value !== 0 && p.value !== "",
  );
  if (!props.length && s.weight_kg === undefined) return null;
  return (
    <Card title={`Scale (read ${s.read_at ?? ""})`}>
      {s.weight_kg !== undefined && s.weight_kg !== null && (
        <div className="kv">
          <div className="k">Weight</div>
          <div className="v">{s.weight_kg} kg</div>
        </div>
      )}
      {props.map((p, i) => (
        <div key={i} className="kv">
          <div className="k">{p.code}</div>
          <div className="v">{String(p.value)}</div>
        </div>
      ))}
    </Card>
  );
}

export function Detail() {
  const { date: dateParam } = useParams<{ date: string }>();
  const date = dateParam ?? todayISO();
  const [det, setDet] = useState<DailyDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getDetail(date).then(setDet).catch((e) => setErr((e as Error).message));
  }, [date]);

  if (err) {
    return (
      <>
        <Link className="muted" to="/">← back</Link>
        <h1>{date}</h1>
        <Card>Error: {err}</Card>
      </>
    );
  }
  if (!det) return <h1>{date}</h1>;

  const mealTotal = det.meals.reduce((s, m) => s + (m.kcal ?? 0), 0);
  const workoutTotal = det.workouts.reduce((s, w) => s + (w.kcal_burn ?? 0), 0);

  return (
    <>
      <Link className="muted" to="/">← back</Link>
      <h1>{date}</h1>

      <Card title="Daily rollup">
        <KVList
          obj={det.daily}
          rows={[
            ["weight_kg", "Weight", " kg"],
            ["waist_cm", "Waist", " cm"],
            ["kcal_in_est", "kcal in"],
            ["kcal_out_est", "kcal out"],
          ]}
        />
      </Card>

      <ScaleCard scaleJson={det.daily?.scale_json as string | null | undefined} />

      {det.garmin && (
        <Card title="Garmin">
          <KVList
            obj={det.garmin}
            rows={[
              ["body_battery", "Body Battery"],
              ["sleep_score", "Sleep score"],
              ["hrv_ms", "HRV", " ms"],
              ["resting_hr", "Resting HR", " bpm"],
              ["stress_avg", "Stress avg"],
              ["steps", "Steps"],
              ["total_burn", "Total burn", " kcal"],
              ["active_burn", "Active burn", " kcal"],
            ]}
          />
        </Card>
      )}

      {det.oura && (
        <Card title="Oura">
          <KVList
            obj={det.oura}
            rows={[
              ["readiness", "Readiness"],
              ["sleep_score", "Sleep score"],
              ["hrv_avg", "HRV balance"],
              ["total_burn", "Total burn", " kcal"],
              ["active_burn", "Active burn", " kcal"],
              ["stress_high_min", "High stress", " min"],
              ["recovery_high_min", "High recovery", " min"],
              ["resilience_level", "Resilience"],
              ["vo2_max", "vO₂ max"],
            ]}
          />
          {det.oura.tags && det.oura.tags.length > 0 && (
            <div className="kv">
              <div className="k">Tags</div>
              <div className="v">
                {det.oura.tags.map((t) => t.name ?? t.type ?? "").join(", ")}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card title={`Meals — ${mealTotal} kcal`}>
        {det.meals.length ? (
          det.meals.map((m) => (
            <div key={m.id} className="meal-row">
              <div>
                <div>{m.category} — {m.raw_text ?? ""}</div>
                <div className="muted">
                  {m.source === "pending"
                    ? "⏳ estimating…"
                    : `${m.kcal ?? "—"} kcal${m.protein_g ? ` · ${m.protein_g}g P` : ""}${m.food_groups ? ` · ${m.food_groups}` : ""}`}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="muted">nothing logged</div>
        )}
      </Card>

      <Card title={`Workouts — ${workoutTotal} kcal`}>
        {det.workouts.length ? (
          det.workouts.map((w) => (
            <div key={w.id} className="meal-row">
              <div>
                <div>
                  {w.kind} · {w.duration_min} min
                  {w.kcal_burn ? ` · ${w.kcal_burn} kcal` : ""}
                  {w.avg_hr ? ` · ${w.avg_hr} bpm` : ""}
                </div>
                {w.notes && <div className="muted">{w.notes}</div>}
              </div>
            </div>
          ))
        ) : (
          <div className="muted">none</div>
        )}
      </Card>
    </>
  );
}
