import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DailyPoint } from "../services/types";

interface Props {
  data: DailyPoint[];
  height?: number;
}

const AXIS = "#4b5563";
const GRID = "#1f2937";
const WEIGHT = "#e5e7eb";
const DEFICIT = "#34d399";
const SURPLUS = "#f87171";

const shortDate = (iso: string) => iso.slice(5);

export function WeightChart({ data, height = 140 }: Props) {
  const values = data.filter((d) => d.weight_kg !== null);
  if (values.length < 2) return <div className="muted">not enough data yet</div>;
  const nums = values.map((d) => d.weight_kg as number);
  const pad = Math.max(0.3, (Math.max(...nums) - Math.min(...nums)) * 0.15);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data.map((d) => ({ ...d, day: shortDate(d.date) }))}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" stroke={AXIS} tick={{ fontSize: 11 }} />
        <YAxis
          stroke={AXIS}
          tick={{ fontSize: 11 }}
          domain={[
            (dataMin: number) => Math.round((dataMin - pad) * 10) / 10,
            (dataMax: number) => Math.round((dataMax + pad) * 10) / 10,
          ]}
          width={36}
        />
        <Tooltip
          contentStyle={{ background: "#0b1220", border: `1px solid ${GRID}`, borderRadius: 8 }}
          labelStyle={{ color: "#9ca3af" }}
          formatter={(v) => [`${v} kg`, "Weight"]}
        />
        <Line
          type="monotone"
          dataKey="weight_kg"
          stroke={WEIGHT}
          strokeWidth={2}
          dot={{ r: 3, fill: WEIGHT }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function NetKcalChart({ data, height = 140 }: Props) {
  const rows = data.map((d) => ({ day: shortDate(d.date), net: d.net }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" stroke={AXIS} tick={{ fontSize: 11 }} />
        <YAxis stroke={AXIS} tick={{ fontSize: 11 }} width={40} />
        <ReferenceLine y={0} stroke={AXIS} />
        <Tooltip
          contentStyle={{ background: "#0b1220", border: `1px solid ${GRID}`, borderRadius: 8 }}
          labelStyle={{ color: "#9ca3af" }}
          formatter={(v: number) => [`${v > 0 ? "+" : ""}${v} kcal`, "Net"]}
        />
        <Bar
          dataKey="net"
          radius={[3, 3, 3, 3]}
          shape={(props: {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
            payload?: { net: number | null };
          }) => {
            const { x = 0, y = 0, width = 0, height: h = 0, payload } = props;
            const v = payload?.net ?? 0;
            if (v === null) return <g />;
            const fill = v < 0 ? DEFICIT : SURPLUS;
            return <rect x={x} y={y} width={width} height={h} fill={fill} rx={3} />;
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
