import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Bars } from "../components/Bars";
import { Card } from "../components/Card";
import { MiniTile } from "../components/MiniTile";
import { Sparkline } from "../components/Sparkline";
import { Stat, StatRow } from "../components/StatRow";
import * as api from "../services/api";
import { fmtKcal, fmtPlain, kcalClass, todayISO } from "../services/dates";
import { subscribePush } from "../services/push";
import type { DailyDetail, DailyPoint, DailySummary, Meal, Workout } from "../services/types";

interface HomeData {
  summary: DailySummary;
  meals: Meal[];
  workouts: Workout[];
  detail: DailyDetail | null;
  history: DailyPoint[];
}

export function Home() {
  const today = todayISO();
  const [data, setData] = useState<HomeData | null>(null);
  const [reload, setReload] = useState(0);
  const bump = () => setReload((r) => r + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [summary, meals, workouts, detail, history] = await Promise.all([
        api.getSummary(),
        api.listMeals(today).catch(() => []),
        api.listWorkouts({ date: today }).catch(() => []),
        api.getDetail(today).catch(() => null),
        api.getHistory(7).catch(() => []),
      ]);
      if (!cancelled) setData({ summary, meals, workouts, detail, history });
    })();
    return () => {
      cancelled = true;
    };
  }, [today, reload]);

  if (!data) return <h1>weight-coach</h1>;
  const { summary: s, meals, workouts, detail, history } = data;
  const g = detail?.garmin;
  const o = detail?.oura;
  const source = g ? "Garmin" : o ? "Oura" : null;

  return (
    <>
      <h1>weight-coach</h1>

      <Card title="Weight">
        <StatRow>
          <Stat label="Today" value={s.today_weight_kg != null ? `${s.today_weight_kg} kg` : "—"} />
          <Stat
            label={`Latest reading${s.latest_weight_date && s.latest_weight_date !== today ? ` (${s.latest_weight_date})` : ""}`}
            value={s.latest_weight_kg != null ? `${s.latest_weight_kg} kg` : "—"}
          />
        </StatRow>
      </Card>

      <Card title="Today">
        <StatRow threeCols>
          <Stat label="In" value={fmtPlain(s.today_kcal_in)} />
          <Stat label="Out" value={fmtPlain(s.today_kcal_out)} />
          <Stat
            label="Net"
            value={fmtKcal(s.today_deficit_kcal)}
            className={kcalClass(s.today_deficit_kcal)}
          />
        </StatRow>
        <div className="muted" style={{ marginTop: 10 }}>
          This week net:{" "}
          <span className={kcalClass(s.week_deficit_kcal)}>{fmtKcal(s.week_deficit_kcal)}</span>
        </div>
      </Card>

      <Card title={`Cumulative (${s.days} days)`}>
        <StatRow>
          <Stat
            label="Deficit total"
            value={fmtKcal(s.cumulative_deficit_kcal)}
            className={kcalClass(s.cumulative_deficit_kcal)}
          />
          <Stat
            label="Predicted vs actual"
            value={`${(s.predicted_kg_lost * -1).toFixed(1)} kg`}
            hint={`actual: ${s.actual_kg_change ?? "—"} kg`}
          />
        </StatRow>
      </Card>

      {history.length > 0 && (
        <Card title="Last 7 days">
          <div className="chart-block">
            <div className="chart-title">Weight (kg)</div>
            <Sparkline values={history.map((d) => d.weight_kg)} showPoints />
          </div>
          <div className="chart-block">
            <div className="chart-title">Net kcal (deficit / surplus)</div>
            <Bars entries={history.map((d) => ({ date: d.date, value: d.net }))} />
          </div>
        </Card>
      )}

      <Card
        title={`Today's readings${source ? ` · ${source}` : ""}`}
        right="tap for detail →"
        href={`#/detail/${today}`}
      >
        <div className="mini-grid">
          {g ? (
            <>
              <MiniTile label="Body Battery" value={g.body_battery} />
              <MiniTile label="Sleep" value={g.sleep_score} />
              <MiniTile label="HRV" value={g.hrv_ms} suffix=" ms" />
              <MiniTile label="Resting HR" value={g.resting_hr} suffix=" bpm" />
              <MiniTile label="Stress" value={g.stress_avg} />
              <MiniTile label="Steps" value={g.steps} />
            </>
          ) : (
            <>
              <MiniTile label="Readiness" value={o?.readiness} />
              <MiniTile label="Sleep" value={o?.sleep_score} />
              <MiniTile label="HRV" value={o?.hrv_avg} />
              <MiniTile label="vO₂ max" value={o?.vo2_max} />
              <MiniTile label="Stress hi" value={o?.stress_high_min} suffix=" min" />
              <MiniTile label="Resilience" value={o?.resilience_level} isText />
            </>
          )}
        </div>
      </Card>

      <SyncButtons onSynced={bump} />

      {workouts.length > 0 && (
        <Card title="Workouts today">
          {workouts.map((w) => (
            <div key={w.id} className="meal-row">
              <div>
                <div>
                  {w.kind} · {w.duration_min} min
                  {w.kcal_burn ? ` · ${w.kcal_burn} kcal` : ""}
                </div>
                {w.notes && <div className="muted">{w.notes}</div>}
              </div>
            </div>
          ))}
        </Card>
      )}

      {meals.length > 0 && (
        <Card title="Meals today">
          {meals.map((m) => (
            <div key={m.id} className="meal-row">
              <div>
                <div>
                  {m.category} — {m.raw_text ?? ""}
                </div>
                <div className="muted">
                  {m.source === "pending"
                    ? "⏳ estimating…"
                    : `${m.kcal ?? "—"} kcal${m.protein_g ? ` · ${m.protein_g}g P` : ""}`}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="row">
        <Link className="card" to="/weight" style={{ textDecoration: "none", color: "inherit" }}>
          <h2>Log weight</h2>
          <div className="muted">Morning, before coffee</div>
        </Link>
        <Link className="card" to="/meal" style={{ textDecoration: "none", color: "inherit" }}>
          <h2>Log meal</h2>
          <div className="muted">Quick add with kcal</div>
        </Link>
        <Link className="card" to="/workout" style={{ textDecoration: "none", color: "inherit" }}>
          <h2>Log workout</h2>
          <div className="muted">X-trainer, run, walk…</div>
        </Link>
        <Link className="card" to="/checkin" style={{ textDecoration: "none", color: "inherit" }}>
          <h2>Nightly check-in</h2>
          <div className="muted">What did you eat today?</div>
        </Link>
      </div>

      <PushSubCard />
    </>
  );
}

function SyncButtons({ onSynced }: { onSynced: () => void }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (label: string, call: () => Promise<{ days_written: number }>) => {
    setBusy(label);
    setMsg("");
    try {
      const r = await call();
      setMsg(`${label}: synced ${r.days_written} day(s).`);
      onSynced();
    } catch (e) {
      setMsg(`${label} error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="card">
      <button
        className="ghost small"
        disabled={busy !== null}
        onClick={() => run("Garmin", api.syncGarmin)}
      >
        {busy === "Garmin" ? "Syncing…" : "Sync Garmin now"}
      </button>
      <button
        className="ghost small"
        style={{ marginLeft: 6 }}
        disabled={busy !== null}
        onClick={() => run("Oura", api.syncOura)}
      >
        {busy === "Oura" ? "Syncing…" : "Sync Oura now"}
      </button>
      <span className="muted" style={{ marginLeft: 10 }}>{msg}</span>
    </div>
  );
}

function PushSubCard() {
  const [msg, setMsg] = useState("");
  return (
    <Card title="Notifications">
      <button
        className="ghost"
        onClick={async () => {
          try {
            setMsg(await subscribePush());
          } catch (e) {
            setMsg((e as Error).message);
          }
        }}
      >
        Enable 23:00 push
      </button>
      <div className="muted">{msg}</div>
    </Card>
  );
}
