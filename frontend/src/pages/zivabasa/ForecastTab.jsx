import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import Card from "../../components/common/Card";
import EmptyState from "../../components/common/EmptyState";
import Skeleton from "../../components/common/Skeleton";
import ForecastLineChart from "../../components/forecast/ForecastLineChart";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { api } from "../../lib/api";

const METRIC_META = {
  automation_risk_percent: { label: "Automation Risk", color: "rgb(var(--red))", unit: "%" },
  ai_adoption_level: { label: "AI Adoption Level", color: "rgb(var(--indigo))", unit: "" },
  skill_gap_index: { label: "Skill Gap Index", color: "rgb(var(--gold))", unit: "" },
};

export default function ForecastTab() {
  const [schema, setSchema] = useState(null);
  const [industry, setIndustry] = useState(null);
  const [horizon, setHorizon] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .forecastSchema()
      .then((s) => {
        setSchema(s);
        setIndustry(s.industries[0]);
        setHorizon(s.default_horizon);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!industry || !horizon) return;
    setLoading(true);
    setError(null);
    api
      .forecast(industry, horizon)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [industry, horizon]);

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <Card animated={false}>
          <EmptyState
            icon={TrendingUp}
            title="Forecast unavailable"
            description={error}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto w-full">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-6">
          <motion.div variants={fadeUpItem} className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-display text-xl font-semibold text-ink">Multi-Year Forecast</h1>
              <p className="text-xs text-ink-muted mt-1 max-w-md">
                Industry-level trend projections from an LSTM trained on{" "}
                {schema ? `${schema.industries.length} industries' historical trajectories` : "historical data"} —
                directional, not a guarantee.
              </p>
            </div>
            {schema && (
              <div className="flex items-center gap-2">
                <select
                  value={industry || ""}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="bg-surface2 border border-border rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-gold/50 transition-colors"
                >
                  {schema.industries.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
                <select
                  value={horizon}
                  onChange={(e) => setHorizon(Number(e.target.value))}
                  className="bg-surface2 border border-border rounded-lg px-3 py-1.5 text-sm text-ink outline-none focus:border-gold/50 transition-colors"
                >
                  {Array.from({ length: schema.max_horizon }, (_, i) => i + 1).map((y) => (
                    <option key={y} value={y}>
                      {y} year{y > 1 ? "s" : ""} out
                    </option>
                  ))}
                </select>
              </div>
            )}
          </motion.div>

          <motion.div variants={fadeUpItem} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loading || !result
              ? [0, 1, 2].map((i) => (
                  <Card key={i} animated={false}>
                    <Skeleton className="h-40 w-full" />
                  </Card>
                ))
              : result.metrics.map((metric) => {
                  const meta = METRIC_META[metric] || { label: metric, color: "rgb(var(--teal))", unit: "" };
                  return (
                    <Card key={metric} animated={false}>
                      <ForecastLineChart
                        title={meta.label}
                        color={meta.color}
                        unit={meta.unit}
                        history={result.history.map((p) => ({ year: p.year, value: p.values[metric] }))}
                        forecast={result.forecast.map((p) => ({ year: p.year, value: p.values[metric] }))}
                      />
                    </Card>
                  );
                })}
          </motion.div>

          <motion.div variants={fadeUpItem}>
            <Card className="text-xs text-ink-muted" animated={false}>
              Methodological note: forecasts are trained on Kaggle proxy data (2020-2026,
              industry-level averages), not real Zimbabwean banking-sector workforce data. Read
              trend direction as a validation of the forecasting pipeline, not a real-world
              prediction — same proxy-data caveat as the rest of this MVP phase.
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
