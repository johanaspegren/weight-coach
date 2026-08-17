import { useEffect, useState } from "react";

import { Sheet } from "../../components/Sheet";
import { todayISO } from "../../services/dates";
import { useCheckin } from "../../services/queries";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LogCheckinSheet({ open, onClose }: Props) {
  const [date, setDate] = useState(todayISO());
  const [text, setText] = useState("");
  const checkin = useCheckin();

  useEffect(() => {
    if (open) {
      setDate(todayISO());
      setText("");
    }
  }, [open]);

  const save = () => {
    if (!text.trim()) return;
    checkin.mutate({ date, transcript: text.trim() }, { onSuccess: onClose });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Nightly check-in">
      <div className="muted">Freetext for now — LLM parsing comes next. Skip breakfast unless you actually had one.</div>
      <label>Date</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label>What did you eat today?</label>
      <textarea
        placeholder={"Lunch: chicken salad w/ olive oil, feta.\nDinner: salmon, rice, broccoli.\nOne beer."}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button onClick={save} disabled={checkin.isPending}>
        {checkin.isPending ? "Saving…" : "Save"}
      </button>
    </Sheet>
  );
}
