// Query key factory + hooks that wrap the API in TanStack Query.
// Views should call these instead of api.* directly.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import * as api from "./api";
import { todayISO } from "./dates";
import type { Meal, Workout } from "./types";

export const qk = {
  summary: () => ["summary"] as const,
  history: (days: number) => ["history", days] as const,
  detail: (date: string) => ["detail", date] as const,
  meals: (date: string) => ["meals", date] as const,
  workouts: (params: { date?: string; limit?: number }) => ["workouts", params] as const,
};

// How often each dataset polls. Short enough that another phone's changes
// show up within one blink; long enough to be gentle on the Pi.
const POLL_MS = 30_000;
const STALE_MS = 10_000;

// Only poll when the tab is actually visible — keeps the Pi quiet when
// the app is in the background on a phone.
const commonPollOpts = {
  refetchInterval: POLL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  staleTime: STALE_MS,
};

export function useSummary() {
  return useQuery({
    queryKey: qk.summary(),
    queryFn: api.getSummary,
    ...commonPollOpts,
  });
}

export function useHistory(days = 7) {
  return useQuery({
    queryKey: qk.history(days),
    queryFn: () => api.getHistory(days),
    ...commonPollOpts,
  });
}

export function useDetail(date: string) {
  return useQuery({
    queryKey: qk.detail(date),
    queryFn: () => api.getDetail(date),
    ...commonPollOpts,
  });
}

export function useMeals(date: string) {
  return useQuery({
    queryKey: qk.meals(date),
    queryFn: () => api.listMeals(date),
    ...commonPollOpts,
  });
}

export function useWorkouts(params: { date?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: qk.workouts(params),
    queryFn: () => api.listWorkouts(params),
    ...commonPollOpts,
  });
}

// ─────────────────────────── Mutations with optimism ───────────────────────────

function invalidateDay(qc: ReturnType<typeof useQueryClient>, date: string) {
  qc.invalidateQueries({ queryKey: qk.summary() });
  qc.invalidateQueries({ queryKey: qk.meals(date) });
  qc.invalidateQueries({ queryKey: qk.workouts({ date }) });
  qc.invalidateQueries({ queryKey: qk.detail(date) });
  qc.invalidateQueries({ queryKey: ["history"] });
}

export function useLogWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.postWeight,
    onSuccess: (_data, vars) => {
      toast.success(`Weighed ${vars.weight_kg} kg`);
      invalidateDay(qc, vars.date);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useLogMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.postMeal,
    // Optimistic: drop the meal into the visible list immediately.
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: qk.meals(vars.date) });
      const prev = qc.getQueryData<Meal[]>(qk.meals(vars.date)) ?? [];
      const ghost: Meal = {
        id: -Date.now(),
        date: vars.date,
        source: vars.kcal != null ? "manual" : "pending",
        category: vars.category,
        raw_text: vars.description,
        kcal: vars.kcal ?? null,
        protein_g: vars.protein_g ?? null,
        carbs_g: vars.carbs_g ?? null,
        fat_g: vars.fat_g ?? null,
        food_groups: vars.food_groups ?? null,
        template_id: null,
      };
      qc.setQueryData<Meal[]>(qk.meals(vars.date), [...prev, ghost]);
      return { prev };
    },
    onError: (e: Error, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.meals(vars.date), ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (_data, vars) => {
      toast.success(`Logged ${vars.description || "meal"}`);
      invalidateDay(qc, vars.date);
    },
  });
}

export function useDeleteMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; date: string }) => api.deleteMeal(id),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: qk.meals(vars.date) });
      const prev = qc.getQueryData<Meal[]>(qk.meals(vars.date)) ?? [];
      qc.setQueryData<Meal[]>(qk.meals(vars.date), prev.filter((m) => m.id !== vars.id));
      return { prev };
    },
    onError: (e: Error, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.meals(vars.date), ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (_data, vars) => {
      toast.success("Removed");
      invalidateDay(qc, vars.date);
    },
  });
}

export function useLogWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.postWorkout,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: qk.workouts({ date: vars.date }) });
      const prev = qc.getQueryData<Workout[]>(qk.workouts({ date: vars.date })) ?? [];
      const ghost: Workout = {
        id: -Date.now(),
        date: vars.date,
        source: "web",
        kind: vars.kind,
        duration_min: vars.duration_min,
        kcal_burn: vars.kcal_burn ?? null,
        avg_hr: vars.avg_hr ?? null,
        notes: vars.notes ?? null,
      };
      qc.setQueryData<Workout[]>(qk.workouts({ date: vars.date }), [...prev, ghost]);
      return { prev };
    },
    onError: (e: Error, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.workouts({ date: vars.date }), ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (_data, vars) => {
      toast.success(`Logged ${vars.kind}`);
      invalidateDay(qc, vars.date);
    },
  });
}

export function useDeleteWorkout(date?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteWorkout(id),
    onSuccess: () => {
      toast.success("Removed");
      invalidateDay(qc, date ?? todayISO());
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.postCheckin,
    onSuccess: (_data, vars) => {
      toast.success("Sleep well 🌙");
      invalidateDay(qc, vars.date);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSyncGarmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.syncGarmin,
    onSuccess: (r) => {
      toast.success(`Garmin: ${r.days_written} day(s) synced`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(`Garmin: ${e.message}`),
  });
}

export function useSyncOura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.syncOura,
    onSuccess: (r) => {
      toast.success(`Oura: ${r.days_written} day(s) synced`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(`Oura: ${e.message}`),
  });
}
