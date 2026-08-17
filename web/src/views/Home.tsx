import { Link } from "react-router-dom";

import { Card } from "../components/Card";
import { NetKcalChart, WeightChart } from "../components/Chart7d";
import { MiniTile } from "../components/MiniTile";
import { Skeleton, SkeletonCard } from "../components/Skeleton";
import { Stat, StatRow } from "../components/StatRow";
import { fmtKcal, fmtPlain, kcalClass, todayISO } from "../services/dates";
import {
  useDetail,
  useHistory,
  useMeals,
  useSummary,
  useWorkouts,
} from "../services/queries";

export function Home() {
  const today = todayISO();
  const summary = useSummary();
  const history = useHistory(7);
  const meals = useMeals(today);
  const workouts = useWorkouts({ date: today });
  const detail = useDetail(today);

  const s = summary.data;
  const g = detail.data?.garmin;
  const o = detail.data?.oura;
  const source = g ? "Garmin" : o ? "Oura" : null;

  return (
    <>
      <h1>weight-coach</h1>

      {summary.isLoading || !s ? (
        <SkeletonCard />
      ) : (
        <Card title="Weight">
          <StatRow>
            <Stat
              label="Today"
              value={s.today_weight_kg != null ? `${s.today_weight_kg} kg` : "—"}
            />
            <Stat
              label={`Latest${s.latest_weight_date && s.latest_weight_date !== today ? ` (${s.latest_weight_date})` : ""}`}
              value={s.latest_weight_kg != null ? `${s.latest_weight_kg} kg` : "—"}
            />
          </StatRow>
        </Card>
      )}

      {summary.isLoading || !s ? (
        <SkeletonCard />
      ) : (
        <>
          <Card title="Today">
            <StatRow threeCols>
              <Stat label="In" value={fmtPlain(s.today_kcal_in)} />
              <Stat label="Out" value={fmtPlain(s.today_kcal_out)} />
              <Stat
                label="Net"
                value={fmtKcal(s.today_deficit_kcal)}
                className={kcalClass(s.today_deficit_kcal)}
              />
            </StatRow>
            <div className="muted" style={{ marginTop: 10 }}>
              This week net:{" "}
              <span className={kcalClass(s.week_deficit_kcal)}>{fmtKcal(s.week_deficit_kcal)}</span>
            </div>
          </Card>

          <Card title={`Cumulative (${s.days} days)`}>
            <StatRow>
              <Stat
                label="Deficit total"
                value={fmtKcal(s.cumulative_deficit_kcal)}
                className={kcalClass(s.cumulative_deficit_kcal)}
              />
              <Stat
                label="Predicted vs actual"
                value={`${(s.predicted_kg_lost * -1).toFixed(1)} kg`}
                hint={`actual: ${s.actual_kg_change ?? "—"} kg`}
              />
            </StatRow>
          </Card>
        </>
      )}

      {history.isLoading ? (
        <SkeletonCard />
      ) : (
        history.data && history.data.length > 0 && (
          <Card title="Last 7 days">
            <div className="chart-block">
              <div className="chart-title">Weight (kg)</div>
              <WeightChart data={history.data} />
            </div>
            <div className="chart-block">
              <div className="chart-title">Net kcal</div>
              <NetKcalChart data={history.data} />
            </div>
          </Card>
        )
      )}

      {detail.isLoading ? (
        <SkeletonCard />
      ) : (
        <Card
          title={`Today's readings${source ? ` · ${source}` : ""}`}
          right="tap for detail →"
          href={`#/detail/${today}`}
        >
          <div className="mini-grid">
            {g ? (
              <>
                <MiniTile label="Body Battery" value={g.body_battery} />
                <MiniTile label="Sleep" value={g.sleep_score} />
                <MiniTile label="HRV" value={g.hrv_ms} suffix=" ms" />
                <MiniTile label="Resting HR" value={g.resting_hr} suffix=" bpm" />
                <MiniTile label="Stress" value={g.stress_avg} />
                <MiniTile label="Steps" value={g.steps} />
              </>
            ) : (
              <>
                <MiniTile label="Readiness" value={o?.readiness} />
                <MiniTile label="Sleep" value={o?.sleep_score} />
                <MiniTile label="HRV" value={o?.hrv_avg} />
                <MiniTile label="vO₂ max" value={o?.vo2_max} />
                <MiniTile label="Stress hi" value={o?.stress_high_min} suffix=" min" />
                <MiniTile label="Resilience" value={o?.resilience_level} isText />
              </>
            )}
          </div>
        </Card>
      )}

      {workouts.data && workouts.data.length > 0 && (
        <Card title="Workouts today">
          {workouts.data.map((w) => (
            <div key={w.id} className="meal-row">
              <div>
                <div>
                  {w.kind} · {w.duration_min} min
                  {w.kcal_burn ? ` · ${w.kcal_burn} kcal` : ""}
                </div>
                {w.notes && <div className="muted">{w.notes}</div>}
              </div>
            </div>
          ))}
        </Card>
      )}

      {meals.data && meals.data.length > 0 && (
        <Card title="Meals today">
          {meals.data.map((m) => (
            <div key={m.id} className={`meal-row${m.id < 0 ? " optimistic" : ""}`}>
              <div>
                <div>{m.category} — {m.raw_text ?? ""}</div>
                <div className="muted">
                  {m.source === "pending" || m.id < 0
                    ? "⏳ estimating…"
                    : `${m.kcal ?? "—"} kcal${m.protein_g ? ` · ${m.protein_g}g P` : ""}`}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="row">
        <Link className="card" to="/log" style={{ textDecoration: "none", color: "inherit" }}>
          <h2>Quick log</h2>
          <div className="muted">Meal, weight, workout, check-in</div>
        </Link>
        <Link className="card" to="/history" style={{ textDecoration: "none", color: "inherit" }}>
          <h2>History</h2>
          <div className="muted">30-day trend</div>
        </Link>
      </div>

      {summary.isRefetching && (
        <div className="muted" style={{ textAlign: "center", padding: 8 }}>
          <Skeleton width={80} height={10} />
        </div>
      )}
    </>
  );
}
