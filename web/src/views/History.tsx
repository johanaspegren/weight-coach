import { useState } from "react";

import { Card } from "../components/Card";
import { NetKcalChart, WeightChart } from "../components/Chart7d";
import { SkeletonCard } from "../components/Skeleton";
import { useHistory } from "../services/queries";

const RANGES = [7, 14, 30, 90] as const;
type Range = typeof RANGES[number];

export function History() {
  const [range, setRange] = useState<Range>(30);
  const q = useHistory(range);

  return (
    <>
      <h1>History</h1>
      <div className="pill-row">
        {RANGES.map((r) => (
          <button
            key={r}
            className={`pill${range === r ? " active" : ""}`}
            onClick={() => setRange(r)}
          >
            {r}d
          </button>
        ))}
      </div>

      {q.isLoading || !q.data ? (
        <SkeletonCard />
      ) : (
        <>
          <Card title="Weight (kg)">
            <WeightChart data={q.data} height={200} />
          </Card>
          <Card title="Net kcal">
            <NetKcalChart data={q.data} height={200} />
          </Card>
        </>
      )}
    </>
  );
}
