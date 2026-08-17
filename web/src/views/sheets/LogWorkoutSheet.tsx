import { useEffect, useState } from "react";

import { Sheet } from "../../components/Sheet";
import { todayISO } from "../../services/dates";
import { useLogWorkout } from "../../services/queries";

const KINDS = ["x-trainer", "run", "walk", "other"] as const;
type Kind = typeof KINDS[number];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LogWorkoutSheet({ open, onClose }: Props) {
  const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState<Kind>("x-trainer");
  const [dur, setDur] = useState("");
  const [kcal, setKcal] = useState("");
  const [hr, setHr] = useState("");
  const [notes, setNotes] = useState("");
  const logWorkout = useLogWorkout();

  useEffect(() => {
    if (open) {
      setDate(todayISO());
      setKind("x-trainer");
      setDur("");
      setKcal("");
      setHr("");
      setNotes("");
    }
  }, [open]);

  const save = () => {
    const duration_min = parseInt(dur, 10);
    if (Number.isNaN(duration_min)) return;
    const body: Parameters<typeof logWorkout.mutate>[0] = { date, kind, duration_min };
    const k = parseInt(kcal, 10);
    const h = parseInt(hr, 10);
    if (!Number.isNaN(k)) body.kcal_burn = k;
    if (!Number.isNaN(h)) body.avg_hr = h;
    if (notes.trim()) body.notes = notes.trim();
    logWorkout.mutate(body, { onSuccess: onClose });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Log workout">
      <div className="row">
        <div>
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label>Type</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <div>
          <label>Duration (min)</label>
          <input type="number" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} autoFocus />
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
      <button onClick={save} disabled={logWorkout.isPending}>
        {logWorkout.isPending ? "Saving…" : "Save workout"}
      </button>
    </Sheet>
  );
}
