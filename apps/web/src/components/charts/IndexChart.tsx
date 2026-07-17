import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IndexQuote } from "@daily-stock/shared";

const UP = "#16a34a";
const DOWN = "#dc2626";

export function IndexChangeChart({ indices }: { indices: IndexQuote[] }) {
  const data = indices.map((i) => ({ name: i.name, pct: i.change_pct }));
  if (data.length === 0) return null;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 24, right: 40 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={110} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.1)" }}
            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
            formatter={(v: number) => [`${v.toFixed(2)}%`, "등락률"]}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.pct >= 0 ? UP : DOWN} />
            ))}
            <LabelList
              dataKey="pct"
              position="right"
              formatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`}
              fill="#e2e8f0"
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
