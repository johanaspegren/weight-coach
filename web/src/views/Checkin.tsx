import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Card } from "../components/Card";
import { postCheckin } from "../services/api";
import { todayISO } from "../services/dates";

export function Checkin() {
  const nav = useNavigate();
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  const save = async () => {
    try {
      await postCheckin({ date, transcript: text });
      nav("/");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <>
      <Link className="muted" to="/">← back</Link>
      <h1>Nightly check-in</h1>
      <Card>
        <div className="muted">
          Freetext for now — LLM parsing arrives in Phase 2. Skip breakfast unless you actually had one.
        </div>
        <label>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label>What did you eat today?</label>
        <textarea
          placeholder={"Lunch: chicken salad w/ olive oil, feta.\nDinner: salmon, rice, broccoli.\nOne beer."}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button onClick={save}>Save</button>
        <div className="muted">{msg}</div>
      </Card>
    </>
  );
}
