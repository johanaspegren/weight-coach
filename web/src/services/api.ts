// One place for every API call. Views never touch fetch directly.

import type {
  DailyDetail,
  DailyPoint,
  DailySummary,
  Meal,
  MealEstimate,
  Workout,
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

// Daily
export const getSummary = () => request<DailySummary>("/daily/summary");
export const getHistory = (days = 7) =>
  request<DailyPoint[]>(`/daily/history?days=${days}`);
export const getDetail = (date: string) =>
  request<DailyDetail>(`/daily/detail?date=${date}`);

// Weight
export const postWeight = (body: {
  date: string;
  weight_kg: number;
  waist_cm?: number;
}) =>
  request<{ ok: true }>("/weight", { method: "POST", body: JSON.stringify(body) });

// Meals
export const listMeals = (date: string) =>
  request<Meal[]>(`/meals?date=${date}`);
export const estimateMeal = (description: string) =>
  request<MealEstimate>("/meals/estimate", {
    method: "POST",
    body: JSON.stringify({ description }),
  });
export const postMeal = (body: {
  date: string;
  category: string;
  description: string;
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  food_groups?: string;
}) => request<{ ok: true; source: string; kcal: number | null }>("/meals", {
  method: "POST",
  body: JSON.stringify(body),
});
export const deleteMeal = (id: number) =>
  request<{ ok: boolean }>(`/meals/${id}`, { method: "DELETE" });

// Workouts
export const listWorkouts = (params?: { date?: string; limit?: number }) => {
  const q = new URLSearchParams();
  if (params?.date) q.set("date", params.date);
  if (params?.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request<Workout[]>(`/workouts${qs ? `?${qs}` : ""}`);
};
export const postWorkout = (body: {
  date: string;
  kind: string;
  duration_min: number;
  kcal_burn?: number;
  avg_hr?: number;
  notes?: string;
}) =>
  request<{ ok: true }>("/workouts", { method: "POST", body: JSON.stringify(body) });
export const deleteWorkout = (id: number) =>
  request<{ ok: boolean }>(`/workouts/${id}`, { method: "DELETE" });

// Checkin
export const postCheckin = (body: { date: string; transcript: string }) =>
  request<{ ok: true }>("/checkin", { method: "POST", body: JSON.stringify(body) });

// Wearable syncs
export const syncOura = () =>
  request<{ ok: true; days_written: number }>("/oura/sync", { method: "POST" });
export const syncGarmin = () =>
  request<{ ok: true; days_written: number }>("/garmin/sync", { method: "POST" });

// Push
export const getVapidKey = () => request<{ key: string }>("/push/vapid-key");
export const postSubscription = (sub: PushSubscriptionJSON) =>
  request<{ ok: true }>("/push/subscribe", {
    method: "POST",
    body: JSON.stringify(sub),
  });
