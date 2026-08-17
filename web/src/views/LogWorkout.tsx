import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Card } from "../components/Card";
import * as api from "../services/api";
import { todayISO } from "../services/dates";
import type { Workout } from "../services/types";

const KINDS = ["x-trainer", "run", "walk", "other"] as const;

export function LogWorkout() {
  const nav = useNavigate();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<typeof KINDS[number]>("x-trainer");
  const [dur, setDur] = useState("");
  const [kcal, setKcal] = useState("");
  const [hr, setHr] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const [recent, setRecent] = useState<Workout[]>([]);

  useEffect(() => {
    api.listWorkouts({ limit: 5 }).then(setRecent).catch(() => setRecent([]));
  }, []);

  const save = async () => {
    try {
      const body: Parameters<typeof api.postWorkout>[0] = {
        date,
        kind,
        duration_min: parseInt(dur, 10),
      };
      const k = parseInt(kcal, 10);
      const h = parseInt(hr, 10);
      if (!Number.isNaN(k)) body.kcal_burn = k;
      if (!Number.isNaN(h)) body.avg_hr = h;
      if (notes.trim()) body.notes = notes.trim();
      await api.postWorkout(body);
      nav("/");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const remove = async (id: number) => {
    await api.deleteWorkout(id);
    setRecent(await api.listWorkouts({ limit: 5 }));
  };

  return (
    <>
      <Link className="muted" to="/">← back</Link>
      <h1>Log workout</h1>
      <Card>
        <div className="muted">Oura already counts activity burn — log here for the running plan and correlation views.</div>
        <div className="row">
          <div>
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label>Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof KINDS[number])}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <div>
            <label>Duration (min)</label>
            <input type="number" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} />
          </div>
          <div>
            <label>kcal — optional</label>
            <input type="number" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div>
            <label>Avg HR — optional</label>
            <input type="number" inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} />
          </div>
          <div>
            <label>Notes</label>
            <input placeholder="Level 8, felt OK" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <button onClick={save}>Add workout</button>
        <div className="muted">{msg}</div>
      </Card>

      {recent.length > 0 && (
        <Card title="Recent">
          {recent.map((w) => (
            <div key={w.id} className="meal-row">
              <div>
                <div>
                  {w.date} — {w.kind} · {w.duration_min} min
                  {w.kcal_burn ? ` · ${w.kcal_burn} kcal` : ""}
                </div>
                {w.notes && <div className="muted">{w.notes}</div>}
              </div>
              <button className="ghost small" onClick={() => remove(w.id)}>✕</button>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
