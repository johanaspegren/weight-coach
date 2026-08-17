interface Props {
  values: Array<number | null>;
  color?: string;
  showPoints?: boolean;
  height?: number;
}

const W = 320;
const PAD_X = 8;
const PAD_Y = 14;

export function Sparkline({ values, color = "#e5e7eb", showPoints = false, height = 90 }: Props) {
  const numeric = values.map((v) => (v === null || v === undefined ? null : +v));
  const nums = numeric.filter((v): v is number => v !== null);
  if (!nums.length) return <div className="muted">no data</div>;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const step = (W - 2 * PAD_X) / Math.max(numeric.length - 1, 1);
  const y = (v: number) => PAD_Y + (height - 2 * PAD_Y) * (1 - (v - min) / span);
  const pts: Array<[number, number] | null> = numeric.map((v, i) =>
    v === null ? null : [PAD_X + i * step, y(v)],
  );

  const segs: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  for (const p of pts) {
    if (p === null) {
      if (cur.length) segs.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length) segs.push(cur);

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} style={{ display: "block" }}>
      <text x={PAD_X} y={12} fill="#9ca3af" fontSize={10}>{max.toFixed(1)}</text>
      <text x={PAD_X} y={height - 2} fill="#9ca3af" fontSize={10}>{min.toFixed(1)}</text>
      {segs.map((s, i) => (
        <polyline
          key={i}
          fill="none"
          stroke={color}
          strokeWidth={2}
          points={s.map((p) => p.join(",")).join(" ")}
        />
      ))}
      {showPoints && pts.map((p, i) =>
        p ? <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill={color} /> : null,
      )}
    </svg>
  );
}
