import type { MarketSummary } from "@daily-stock/shared";

function pctColor(pct: number): string {
  // Map -3%..+3% onto a red↔green wash; clamp for stability.
  const c = Math.max(-3, Math.min(3, pct));
  const a = 0.12 + (Math.abs(c) / 3) * 0.33;
  return c >= 0 ? `rgba(70,190,134,${a.toFixed(3)})` : `rgba(229,96,92,${a.toFixed(3)})`;
}

function MacroStrip({ macro }: { macro: MarketSummary["macro"] }) {
  if (!macro.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {macro.map((m, i) => {
        const up = m.change >= 0;
        return (
          <div key={i} className="min-w-[120px] flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
            <div className="eyebrow text-slate-500">{m.label}</div>
            <div className="tnum mt-0.5 font-mono text-base font-semibold">
              {m.value.toLocaleString()}
              {m.unit && <span className="ml-0.5 text-xs text-slate-500">{m.unit}</span>}
            </div>
            {m.change !== 0 && (
              <div className={`tnum font-mono text-[11px] ${up ? "text-up" : "text-down"}`}>
                {up ? "▲" : "▼"} {Math.abs(m.change).toLocaleString()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MoverList({ title, rows, up }: { title: string; rows: { ticker: string; pct: number }[]; up: boolean }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.pct)), 0.01);
  return (
    <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="eyebrow mb-2 text-slate-500">{title}</div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.ticker} className="flex items-center gap-2">
            <span className="tnum w-14 font-mono text-xs text-slate-300">{r.ticker}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-slate-800/60">
              <div
                className={`h-full ${up ? "bg-up" : "bg-down"}`}
                style={{ width: `${(Math.abs(r.pct) / max) * 100}%`, opacity: 0.7 }}
              />
            </div>
            <span className={`tnum w-14 text-right font-mono text-xs ${up ? "text-up" : "text-down"}`}>
              {up ? "+" : ""}
              {r.pct.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectorHeatmap({ rows }: { rows: MarketSummary["sector_perf"] }) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="eyebrow mb-2 text-slate-500">섹터 등락 히트맵</div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {rows.map((s, i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-800 px-3 py-2.5"
            style={{ backgroundColor: pctColor(s.pct) }}
          >
            <div className="text-xs font-medium text-slate-100">{s.label}</div>
            <div className={`tnum mt-0.5 font-mono text-sm font-semibold ${s.pct >= 0 ? "text-up" : "text-down"}`}>
              {s.pct >= 0 ? "+" : ""}
              {s.pct.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketExtras({ market }: { market: MarketSummary }) {
  const hasMovers = market.movers.gainers.length > 0 || market.movers.losers.length > 0;
  if (!market.macro.length && !hasMovers && !market.sector_perf.length) return null;
  return (
    <div className="mt-4 flex flex-col gap-4">
      <MacroStrip macro={market.macro} />
      {hasMovers && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <MoverList title="상승 상위 · Gainers" rows={market.movers.gainers} up />
          <MoverList title="하락 상위 · Losers" rows={market.movers.losers} up={false} />
        </div>
      )}
      <SectorHeatmap rows={market.sector_perf} />
    </div>
  );
}
