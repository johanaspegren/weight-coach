import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { Sheet } from "../../components/Sheet";
import * as api from "../../services/api";
import { todayISO } from "../../services/dates";
import { useLogMeal } from "../../services/queries";
import type { MealEstimate } from "../../services/types";

const CATEGORIES = ["lunch", "dinner", "snack", "breakfast"] as const;
type Category = typeof CATEGORIES[number];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LogMealSheet({ open, onClose }: Props) {
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<Category>("lunch");
  const [desc, setDesc] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [foodGroups, setFoodGroups] = useState("");
  const [srcLine, setSrcLine] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [visioning, setVisioning] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const logMeal = useLogMeal();

  useEffect(() => {
    if (open) {
      setDate(todayISO());
      setCategory("lunch");
      setDesc("");
      setKcal("");
      setProtein("");
      setCarbs("");
      setFat("");
      setFoodGroups("");
      setSrcLine("");
      setPhotoPreview(null);
    }
  }, [open]);

  const applyEstimate = (est: MealEstimate, describedName?: string | null) => {
    if (est.kcal != null) setKcal(String(est.kcal));
    if (est.protein_g != null) setProtein(String(est.protein_g));
    if (est.carbs_g != null) setCarbs(String(est.carbs_g));
    if (est.fat_g != null) setFat(String(est.fat_g));
    if (est.food_groups) setFoodGroups(est.food_groups);
    if (describedName && !desc.trim()) setDesc(describedName);
  };

  const textLookup = async () => {
    if (!desc.trim()) return setSrcLine("Type a description first.");
    setLookingUp(true);
    setSrcLine("");
    try {
      const est = await api.estimateMeal(desc.trim());
      applyEstimate(est);
      if (est.source === "template") setSrcLine("From remembered meal — edit if wrong.");
      else if (est.source === "pending" || est.kcal === null) setSrcLine("No LLM available — save anyway, we'll fill in later.");
      else setSrcLine(`Estimated by ${est.model ?? "LLM"} — edit if wrong.`);
    } catch (e) {
      setSrcLine((e as Error).message);
    } finally {
      setLookingUp(false);
    }
  };

  const onPhotoChosen = async (file: File) => {
    setPhotoPreview(URL.createObjectURL(file));
    setVisioning(true);
    setSrcLine("Analyzing photo…");
    try {
      const est = await api.estimateMealVision(file);
      applyEstimate(est, est.description);
      if (est.kcal == null) {
        setSrcLine("Photo unclear — please type a description.");
      } else {
        setSrcLine(`From photo (${est.model ?? "vision LLM"}) — edit if wrong.`);
      }
    } catch (e) {
      setSrcLine((e as Error).message);
      toast.error("Vision failed — falling back to typing");
    } finally {
      setVisioning(false);
    }
  };

  const save = () => {
    if (!desc.trim()) {
      toast.error("Add a description");
      return;
    }
    const body: Parameters<typeof logMeal.mutate>[0] = {
      date,
      category,
      description: desc.trim(),
    };
    const k = parseInt(kcal, 10);
    const p = parseFloat(protein);
    const c = parseFloat(carbs);
    const f = parseFloat(fat);
    if (!Number.isNaN(k)) body.kcal = k;
    if (!Number.isNaN(p)) body.protein_g = p;
    if (!Number.isNaN(c)) body.carbs_g = c;
    if (!Number.isNaN(f)) body.fat_g = f;
    if (foodGroups.trim()) body.food_groups = foodGroups.trim();
    logMeal.mutate(body, { onSuccess: onClose });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Log meal">
      <div className="row">
        <div>
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <label>Photo → auto-estimate</label>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPhotoChosen(f);
        }}
      />
      <div className="photo-row">
        <button
          type="button"
          className="ghost"
          onClick={() => cameraRef.current?.click()}
          disabled={visioning}
        >
          📷 {visioning ? "Analyzing…" : "Take / choose photo"}
        </button>
        {photoPreview && <img className="photo-preview" src={photoPreview} alt="meal" />}
      </div>

      <label>Description</label>
      <div className="row lookup-row">
        <input
          placeholder="Chicken salad, feta, olive oil"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <button className="ghost small" onClick={textLookup} disabled={lookingUp || visioning}>
          {lookingUp ? "…" : "Look up"}
        </button>
      </div>
      <div className="muted">{srcLine}</div>

      <div className="row">
        <div>
          <label>kcal</label>
          <input type="number" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </div>
        <div>
          <label>Protein (g)</label>
          <input type="number" step="0.1" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div>
          <label>Carbs (g)</label>
          <input type="number" step="0.1" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
        </div>
        <div>
          <label>Fat (g)</label>
          <input type="number" step="0.1" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} />
        </div>
      </div>

      <label>Food groups — optional</label>
      <input
        placeholder="protein, veg, dairy, fat"
        value={foodGroups}
        onChange={(e) => setFoodGroups(e.target.value)}
      />

      <button onClick={save} disabled={logMeal.isPending}>
        {logMeal.isPending ? "Saving…" : "Add meal"}
      </button>
    </Sheet>
  );
}
