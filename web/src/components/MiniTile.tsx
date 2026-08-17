interface Props {
  label: string;
  value: number | string | null | undefined;
  suffix?: string;
  isText?: boolean;
}

export function MiniTile({ label, value, suffix = "", isText = false }: Props) {
  const has = value !== null && value !== undefined && value !== "";
  const shown = !has
    ? "—"
    : isText
    ? String(value)
    : `${Math.round(Number(value) * 10) / 10}${suffix}`;
  return (
    <div className="mini">
      <div className="lbl">{label}</div>
      <div className="mini-val">{shown}</div>
    </div>
  );
}
