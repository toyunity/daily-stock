import type { GeoBrief, GeoActor } from "@daily-stock/shared";
import { OilChart } from "./report/OilChart";
import { StraitSchematic } from "./geo/StraitSchematic";

const RUNGS = [
  { n: 5, label: "전면전" },
  { n: 4, label: "지속 타격 · 봉쇄" },
  { n: 3, label: "제한적 타격" },
  { n: 2, label: "고조된 긴장" },
  { n: 1, label: "협상 · 완화" },
];

function isIrgc(a: GeoActor): boolean {
  return /IRGC|혁명수비대/i.test(`${a.name} ${a.role}`);
}
function badgeClass(a: GeoActor): string {
  if (a.stance === "hard") return isIrgc(a) ? "badge hardest" : "badge hard";
  return "badge";
}
function stanceLabel(a: GeoActor): string {
  if (a.stance === "hard") return isIrgc(a) ? "최강경" : "강경";
  if (a.stance === "soft") return "대화 우선";
  return "압박 + 협상";
}

function ActorRow({ actor }: { actor: GeoActor }) {
  return (
    <div className="actor">
      <span className={badgeClass(actor)}>{actor.name}</span>
      <div>
        <div className="who">{stanceLabel(actor)}</div>
        {actor.quotes.map((q, i) => (
          <div key={i}>
            <div className="quote">“{q.text}”</div>
            <div className="src">
              출처 ·{" "}
              <a href={q.source.url} target="_blank" rel="noreferrer">
                {q.source.name}
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GeopoliticsSection({ brief }: { brief: GeoBrief }) {
  const level = Math.min(5, Math.max(1, Math.round(brief.escalation_level)));
  const lastOil = brief.oil_series[brief.oil_series.length - 1];

  return (
    <section className="sec">
      <div className="sec-head">
        <h2>지정학 브리핑</h2>
        <span className="en">{brief.theater || "Geopolitics"}</span>
        <span className="grow" />
        <span className="en" style={{ color: "var(--accent)" }}>
          긴장 수위 {String(level).padStart(2, "0")} / 05
        </span>
      </div>

      <div className="geo-grid">
        {/* LEFT */}
        <div>
          <div className="panel">
            <div className="panel-title">긴장 수위 사다리 · Escalation Ladder</div>
            <div className="ladder">
              {RUNGS.map((r) => {
                const cls = r.n === level ? "rung cur" : r.n < level ? "rung done" : "rung";
                return (
                  <div key={r.n} className={cls}>
                    <span className="no">{String(r.n).padStart(2, "0")}</span>
                    <span className="track" />
                    <span className="lb">{r.label}</span>
                    {r.n === level && <span className="now">{brief.escalation_label || "현 위치"}</span>}
                  </div>
                );
              })}
            </div>
            {brief.summary && <p className="geo-summary" style={{ marginTop: 18 }}>{brief.summary}</p>}
          </div>

          {brief.oil_series.length >= 2 && (
            <div className="panel">
              <div className="panel-title">유가 추이 · Brent Crude (USD/bbl)</div>
              <div className="chartwrap">
                <div className="chart-cap">
                  <span className="eyebrow muted">추이</span>
                  {lastOil && <span className="now">{lastOil.label} · ${lastOil.value}</span>}
                </div>
                <OilChart series={brief.oil_series} />
              </div>
              {brief.market_note && <p className="geo-summary" style={{ marginTop: 12, fontSize: 13.5 }}>{brief.market_note}</p>}
            </div>
          )}

          <div className="panel">
            <div className="panel-title">호르무즈 해협 · Chokepoint</div>
            <StraitSchematic />
          </div>
        </div>

        {/* RIGHT */}
        <div className="col-rule">
          {brief.actors.length > 0 && (
            <>
              <div className="panel-title">행위자 · Key Actors</div>
              {brief.actors.map((a, i) => (
                <ActorRow key={i} actor={a} />
              ))}
            </>
          )}

          {brief.timeline.length > 0 && (
            <div className="panel" style={{ marginTop: 26 }}>
              <div className="panel-title">타임라인 · Timeline</div>
              <div className="timeline">
                {brief.timeline.map((e, i) => (
                  <div key={i} className={`tl${i === brief.timeline.length - 1 ? " last" : ""}`}>
                    <span className="date">{e.date}</span>
                    <span className="ev">{e.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {brief.watchpoints.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <div className="panel-title">관전 포인트 · What to Watch</div>
              <div className="watch">
                {brief.watchpoints.map((w, i) => (
                  <div key={i} className="w">
                    <span className="n">{String(i + 1).padStart(2, "0")}</span>
                    {w}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
