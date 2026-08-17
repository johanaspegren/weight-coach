import { useEffect, useState } from "react";

import { Sheet } from "../../components/Sheet";
import { todayISO } from "../../services/dates";
import { useLogWeight } from "../../services/queries";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LogWeightSheet({ open, onClose }: Props) {
  const [date, setDate] = useState(todayISO());
  const [kg, setKg] = useState("");
  const [waist, setWaist] = useState("");
  const logWeight = useLogWeight();

  useEffect(() => {
    if (open) {
      setDate(todayISO());
      setKg("");
      setWaist("");
    }
  }, [open]);

  const save = () => {
    const w = parseFloat(kg);
    if (Number.isNaN(w)) return;
    const body: Parameters<typeof logWeight.mutate>[0] = { date, weight_kg: w };
    const wa = parseFloat(waist);
    if (!Number.isNaN(wa)) body.waist_cm = wa;
    logWeight.mutate(body, { onSuccess: onClose });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Log weight">
      <label>Date</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label>Weight (kg)</label>
      <input
        type="number"
        step="0.1"
        inputMode="decimal"
        autoFocus
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
      <button onClick={save} disabled={logWeight.isPending}>
        {logWeight.isPending ? "Saving…" : "Save"}
      </button>
    </Sheet>
  );
}
