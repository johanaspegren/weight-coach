import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Card } from "../components/Card";
import * as api from "../services/api";
import { todayISO } from "../services/dates";
import type { Meal, MealEstimate } from "../services/types";

const CATEGORIES = ["lunch", "dinner", "snack", "breakfast"] as const;

export function LogMeal() {
  const nav = useNavigate();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("lunch");
  const [desc, setDesc] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [foodGroups, setFoodGroups] = useState("");
  const [srcLine, setSrcLine] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [msg, setMsg] = useState("");
  const [existing, setExisting] = useState<Meal[]>([]);

  useEffect(() => {
    api.listMeals(today).then(setExisting).catch(() => setExisting([]));
  }, [today]);

  const lookup = async () => {
    if (!desc.trim()) {
      setSrcLine("Type a description first.");
      return;
    }
    setLookingUp(true);
    setSrcLine("");
    try {
      const est: MealEstimate = await api.estimateMeal(desc.trim());
      const setIf = (v: number | null | undefined, setter: (s: string) => void) => {
        if (v !== null && v !== undefined) setter(String(v));
      };
      setIf(est.kcal, setKcal);
      setIf(est.protein_g, setProtein);
      setIf(est.carbs_g, setCarbs);
      setIf(est.fat_g, setFat);
      if (est.food_groups) setFoodGroups(est.food_groups);
      if (est.source === "template") {
        setSrcLine("From remembered meal (edit and save to update).");
      } else if (est.source === "pending" || est.kcal === null) {
        setSrcLine("No LLM available — save anyway and it'll be estimated later.");
      } else {
        setSrcLine(`Estimated by ${est.model ?? "LLM"} — adjust if wrong.`);
      }
    } catch (e) {
      setSrcLine((e as Error).message);
    } finally {
      setLookingUp(false);
    }
  };

  const save = async () => {
    try {
      const body: Parameters<typeof api.postMeal>[0] = { date, category, description: desc };
      const kcalN = parseInt(kcal, 10);
      if (!Number.isNaN(kcalN)) body.kcal = kcalN;
      const p = parseFloat(protein);
      const c = parseFloat(carbs);
      const f = parseFloat(fat);
      if (!Number.isNaN(p)) body.protein_g = p;
      if (!Number.isNaN(c)) body.carbs_g = c;
      if (!Number.isNaN(f)) body.fat_g = f;
      if (foodGroups.trim()) body.food_groups = foodGroups.trim();
      await api.postMeal(body);
      nav("/");
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const remove = async (id: number) => {
    await api.deleteMeal(id);
    setExisting(await api.listMeals(today));
  };

  return (
    <>
      <Link className="muted" to="/">← back</Link>
      <h1>Log meal</h1>
      <Card>
        <div className="row">
          <div>
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number])}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <label>What did you have?</label>
        <div className="row lookup-row">
          <input
            placeholder="Chicken salad, feta, olive oil"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <button className="ghost small" onClick={lookup} disabled={lookingUp}>
            {lookingUp ? "Looking up…" : "Look up"}
          </button>
        </div>
        <div className="muted">{srcLine}</div>
        <div className="row">
          <div>
            <label>kcal</label>
            <input type="number" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
          </div>
          <div>
            <label>Protein (g) — optional</label>
            <input type="number" step="0.1" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
          </div>
        </div>
        <div className="row">
          <div>
            <label>Carbs (g) — optional</label>
            <input type="number" step="0.1" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
          </div>
          <div>
            <label>Fat (g) — optional</label>
            <input type="number" step="0.1" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} />
          </div>
        </div>
        <label>Food groups — optional</label>
        <input placeholder="protein, veg, dairy, fat" value={foodGroups} onChange={(e) => setFoodGroups(e.target.value)} />
        <button onClick={save}>Add meal</button>
        <div className="muted">{msg}</div>
      </Card>

      {existing.length > 0 && (
        <Card title="Today so far">
          {existing.map((m) => (
            <div key={m.id} className="meal-row">
              <div>
                <div>{m.category} — {m.raw_text ?? ""}</div>
                <div className="muted">
                  {m.source === "pending"
                    ? "⏳ estimating…"
                    : `${m.kcal ?? "—"} kcal${m.protein_g ? ` · ${m.protein_g}g P` : ""}`}
                </div>
              </div>
              <button className="ghost small" onClick={() => remove(m.id)}>✕</button>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
