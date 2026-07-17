import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@daily-stock/shared";

/** Render an LLM-provided chart spec. Falls back to nothing on malformed data. */
export function SectionChart({ spec }: { spec: ChartSpec }) {
  if (!spec?.data?.length) return null;
  const x = spec.x ?? "name";
  const y = spec.y ?? "value";

  const axisStyle = { fill: "#94a3b8", fontSize: 12 };
  const tooltipStyle = {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 8,
  } as const;

  return (
    <div className="mt-4 h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {spec.type === "line" ? (
          <LineChart data={spec.data} margin={{ left: 8, right: 16, top: 8 }}>
            <CartesianGrid stroke="#1e293b" />
            <XAxis dataKey={x} tick={axisStyle} />
            <YAxis tick={axisStyle} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey={y} stroke="#38bdf8" strokeWidth={2} dot={false} />
          </LineChart>
        ) : (
          <BarChart data={spec.data} margin={{ left: 8, right: 16, top: 8 }}>
            <CartesianGrid stroke="#1e293b" />
            <XAxis dataKey={x} tick={axisStyle} />
            <YAxis tick={axisStyle} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(148,163,184,0.1)" }} />
            <Bar dataKey={y} fill="#38bdf8" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
