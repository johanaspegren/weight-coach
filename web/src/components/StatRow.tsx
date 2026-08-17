import type { ReactNode } from "react";

interface StatProps {
  label: string;
  value: ReactNode;
  className?: string;
  hint?: string;
}

export function Stat({ label, value, className = "", hint }: StatProps) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className={`big ${className}`.trim()}>{value}</div>
      {hint && <div className="muted">{hint}</div>}
    </div>
  );
}

export function StatRow({ children, threeCols }: { children: ReactNode; threeCols?: boolean }) {
  return (
    <div className={`stat${threeCols ? " stat-3" : ""}`}>{children}</div>
  );
}
