export const todayISO = () => new Date().toISOString().slice(0, 10);

export const fmtKcal = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return "—";
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  return `${sign}${Math.abs(n).toLocaleString()} kcal`;
};

export const fmtPlain = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n).toLocaleString()} kcal`;
};

export const kcalClass = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return "";
  return n < 0 ? "deficit" : n > 0 ? "surplus" : "";
};
