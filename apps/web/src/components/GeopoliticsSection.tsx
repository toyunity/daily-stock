import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GeoBrief, GeoActor, GeoStance } from "@daily-stock/shared";
import { StraitSchematic } from "./geo/StraitSchematic";

const RUNGS = [
  { n: 5, label: "전면전", sub: "지속적 대규모 군사작전" },
  { n: 4, label: "지속 타격·봉쇄", sub: "반복 타격, 요충지 봉쇄" },
  { n: 3, label: "제한적 타격", sub: "표적 공습·국지 보복" },
  { n: 2, label: "고조된 긴장", sub: "위협·제재·군사 배치" },
  { n: 1, label: "협상·완화", sub: "휴전·대화 국면" },
];

const STANCE: Record<GeoStance, { label: string; cls: string }> = {
  hard: { label: "강경", cls: "text-crit bg-crit/15" },
  mixed: { label: "압박+협상", cls: "text-warn bg-warn/15" },
  soft: { label: "대화 우선", cls: "text-ok bg-ok/15" },
};

function ActorCard({ actor }: { actor: GeoActor }) {
  const st = STANCE[actor.stance] ?? STANCE.mixed;
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="font-report text-base font-semibold">{actor.name}</div>
        {actor.role && <div className="eyebrow mt-0.5 text-slate-500">{actor.role}</div>}
        <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${st.cls}`}>
          {st.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        {actor.quotes.map((q, i) => (
          <div key={i} className="border-l-2 border-slate-700 pl-3 text-sm leading-relaxed text-slate-200">
            {q.text}
            <a
              href={q.source.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-[11px] text-slate-500 hover:text-sky-400"
            >
              {q.source.name} ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function OilMiniChart({ series }: { series: { label: string; value: number }[] }) {
  if (series.length < 2) return null;
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="oilfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e3b24a" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#e3b24a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fill: "#93a0b2", fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "#93a0b2", fontSize: 11 }} width={38} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
            formatter={(v: number) => [`$${v}`, "Brent"]}
          />
          <Area type="monotone" dataKey="value" stroke="#e3b24a" strokeWidth={2} fill="url(#oilfill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GeopoliticsSection({ brief }: { brief: GeoBrief }) {
  const level = Math.min(5, Math.max(1, Math.round(brief.escalation_level)));
  const hasImpact = brief.oil_series.length >= 2 || brief.market_note;
  return (
    <section className="rounded-2xl border border-amber-900/40 bg-gradient-to-b from-amber-950/20 to-slate-900 p-5">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="eyebrow text-accent">지정학 브리핑 · Geopolitics</span>
        {brief.theater && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">{brief.theater}</span>}
        <span className="h-px flex-1 bg-slate-800" />
      </div>

      <h2 className="font-report text-xl font-semibold text-slate-100">{brief.headline}</h2>
      {brief.summary && <p className="font-report mt-2 text-slate-300">{brief.summary}</p>}

      {/* Escalation ladder */}
      <div className="mt-5">
        <div className="eyebrow mb-2 text-slate-500">긴장 수위</div>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          {RUNGS.map((r, i) => {
            const here = r.n === level;
            return (
              <div
                key={r.n}
                className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-slate-800" : ""} ${
                  here ? "bg-crit/10 shadow-[inset_3px_0_0_theme(colors.crit)]" : ""
                }`}
              >
                <span className="tnum w-6 text-center font-mono text-xs text-slate-500">{String(r.n).padStart(2, "0")}</span>
                <span className="flex-1">
                  <span className={`text-sm ${here ? "font-bold text-slate-100" : "text-slate-300"}`}>{r.label}</span>
                  <span className="ml-2 text-xs text-slate-500">{r.sub}</span>
                </span>
                {here && (
                  <span className="rounded-full border border-crit/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-crit">
                    {brief.escalation_label || "현 위치"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Market impact + Strait schematic */}
      {hasImpact && (
        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="eyebrow mb-2 text-slate-500">요충지 · 호르무즈 해협</div>
            <StraitSchematic />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="eyebrow mb-2 text-slate-500">시장 파급 · 유가</div>
            <OilMiniChart series={brief.oil_series} />
            {brief.market_note && <p className="font-report mt-2 text-sm text-slate-300">{brief.market_note}</p>}
          </div>
        </div>
      )}

      {/* Actor positions */}
      {brief.actors.length > 0 && (
        <div className="mt-5">
          <div className="eyebrow mb-2 text-slate-500">주요 행위자 입장</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {brief.actors.map((a, i) => (
              <ActorCard key={i} actor={a} />
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {brief.timeline.length > 0 && (
        <div className="mt-5">
          <div className="eyebrow mb-2 text-slate-500">사건 타임라인</div>
          <ol className="rounded-xl border border-slate-800 bg-slate-900/60">
            {brief.timeline.map((e, i) => (
              <li key={i} className={`grid grid-cols-[64px_1fr] gap-3 px-4 py-3 ${i > 0 ? "border-t border-slate-800" : ""}`}>
                <span className={`tnum font-mono text-xs font-semibold ${e.severity === "high" ? "text-crit" : "text-accent"}`}>
                  {e.date}
                </span>
                <span>
                  <span className="font-report text-sm font-semibold text-slate-100">{e.title}</span>
                  {e.detail && <span className="mt-0.5 block text-sm text-slate-400">{e.detail}</span>}
                  {e.sources.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-2">
                      {e.sources.map((s, j) => (
                        <a key={j} href={s.url} target="_blank" rel="noreferrer" className="text-[11px] text-slate-500 hover:text-sky-400">
                          {s.name} ↗
                        </a>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Watchpoints */}
      {brief.watchpoints.length > 0 && (
        <div className="mt-5">
          <div className="eyebrow mb-2 text-slate-500">관전 포인트</div>
          <ul className="flex flex-col gap-1.5">
            {brief.watchpoints.map((w, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span className="text-accent">▸</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
