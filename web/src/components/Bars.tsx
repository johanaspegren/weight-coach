interface Entry {
  date: string;
  value: number | null;
}

interface Props {
  entries: Entry[];
  height?: number;
}

const W = 320;
const PAD_X = 8;
const PAD_Y = 14;
const GAP = 3;

export function Bars({ entries, height = 90 }: Props) {
  const values = entries.map((e) => (e.value === null ? 0 : e.value));
  const abs = values.map((v) => Math.abs(v));
  const max = Math.max(1, ...abs);
  const barW = (W - 2 * PAD_X - GAP * (entries.length - 1)) / entries.length;
  const mid = height / 2;
  const half = mid - PAD_Y;

  const firstLbl = entries[0]?.date?.slice(5) ?? "";
  const lastLbl = entries[entries.length - 1]?.date?.slice(5) ?? "";

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} style={{ display: "block" }}>
      <line x1={PAD_X} x2={W - PAD_X} y1={mid} y2={mid} stroke="#374151" strokeWidth={1} />
      {entries.map((e, i) => {
        const v = e.value;
        if (v === null) return null;
        const h = (Math.abs(v) / max) * half;
        const x = PAD_X + i * (barW + GAP);
        const [y, color] = v < 0 ? [mid, "#34d399"] : [mid - h, "#f87171"];
        return <rect key={i} x={x} y={y} width={barW} height={h} fill={color} rx={2} />;
      })}
      <text x={PAD_X} y={height - 2} fill="#9ca3af" fontSize={10}>{firstLbl}</text>
      <text x={W - PAD_X} y={height - 2} fill="#9ca3af" fontSize={10} textAnchor="end">{lastLbl}</text>
    </svg>
  );
}
