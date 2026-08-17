import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Card } from "../components/Card";
import { postWeight } from "../services/api";
import { todayISO } from "../services/dates";

export function LogWeight() {
  const nav = useNavigate();
  const [date, setDate] = useState(todayISO());
  const [kg, setKg] = useState("");
  const [waist, setWaist] = useState("");
  const [msg, setMsg] = useState("");

  const save = async () => {
    try {
      const body: { date: string; weight_kg: number; waist_cm?: number } = {
        date,
        weight_kg: parseFloat(kg),
      };
      const w = parseFloat(waist);
      if (!Number.isNaN(w)) body.waist_cm = w;
      await postWeight(body);
      nav("/");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <>
      <Link className="muted" to="/">← back</Link>
      <h1>Log weight</h1>
      <Card>
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label>Weight (kg)</label>
        <input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={kg}
          onChange={(e) => setKg(e.target.value)}
        />
        <label>Waist (cm) — optional</label>
        <input
          type="number"
          step="0.5"
          inputMode="decimal"
          value={waist}
          onChange={(e) => setWaist(e.target.value)}
        />
        <button onClick={save}>Save</button>
        <div className="muted">{msg}</div>
      </Card>
    </>
  );
}
