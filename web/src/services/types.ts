// Shared response shapes for the weight-coach API.

export interface DailySummary {
  program_start: string;
  days: number;
  today_weight_kg: number | null;
  latest_weight_kg: number | null;
  latest_weight_date: string | null;
  today_kcal_in: number | null;
  today_kcal_out: number | null;
  today_deficit_kcal: number | null;
  week_deficit_kcal: number;
  cumulative_deficit_kcal: number;
  predicted_kg_lost: number;
  actual_kg_change: number | null;
}

export interface DailyPoint {
  date: string;
  weight_kg: number | null;
  kcal_in: number | null;
  kcal_out: number | null;
  net: number | null;
}

export interface Meal {
  id: number;
  date: string;
  source: "manual" | "checkin" | "pending" | "discord" | "template";
  category: string | null;
  raw_text: string | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  food_groups: string | null;
  template_id: number | null;
}

export interface Workout {
  id: number;
  date: string;
  source: string;
  kind: string;
  duration_min: number | null;
  kcal_burn: number | null;
  avg_hr: number | null;
  notes: string | null;
}

export interface GarminDay {
  date: string;
  body_battery: number | null;
  sleep_score: number | null;
  hrv_ms: number | null;
  resting_hr: number | null;
  stress_avg: number | null;
  total_burn: number | null;
  active_burn: number | null;
  steps: number | null;
  workouts?: unknown[];
}

export interface OuraDay {
  date: string;
  readiness: number | null;
  sleep_score: number | null;
  hrv_avg: number | null;
  total_burn: number | null;
  active_burn: number | null;
  stress_high_min: number | null;
  recovery_high_min: number | null;
  resilience_level: string | null;
  vo2_max: number | null;
  tags?: Array<{ type?: string; name?: string; comment?: string }>;
}

export interface DailyDetail {
  date: string;
  daily: (Record<string, unknown> & { scale_json?: string | null }) | null;
  oura: OuraDay | null;
  garmin: GarminDay | null;
  meals: Meal[];
  workouts: Workout[];
}

export interface MealEstimate {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  food_groups: string | null;
  source: "template" | "llm" | "pending";
  template_id: number | null;
  model: string | null;
}
