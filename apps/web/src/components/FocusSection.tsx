import type { FocusAnalysis, Driver, Scenario } from "@daily-stock/shared";
import { PriceChart } from "./report/PriceChart";

function money(v: number, cur: string): string {
  const p = cur === "KRW" ? "₩" : cur === "USD" ? "$" : "";
  return p + v.toLocaleString();
}
function compact(v: number, cur: string): string {
  const p = cur === "KRW" ? "₩" : cur === "USD" ? "$" : "";
  if (Math.abs(v) >= 1_000_000) return p + (v / 1_000_000).toFixed(2) + "M";
  if (Math.abs(v) >= 1_000) return p + (v / 1_000).toFixed(0) + "K";
  return p + v;
}

function DriverList({ title, rows, kind }: { title: string; rows: Driver[]; kind: "pos" | "neg" }) {
  return (
    <div className={`dr ${kind}`}>
      <h4>{title}</h4>
      <ul>
        {rows.map((d, i) => (
          <li key={i}>
            {d.point}
            {d.source && (
              <a href={d.source.url} target="_blank" rel="noreferrer">
                {d.source.name} ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const SCEN_LABEL: Record<Scenario["kind"], string> = { bull: "강세 · Bull", base: "기본 · Base", bear: "약세 · Bear" };

export function FocusSection({ focus }: { focus: FocusAnalysis }) {
  const cur = focus.price.currency;
  const up = focus.price.change_pct >= 0;
  return (
    <section className="sec">
      <div className="sec-head">
        <h2>심층 분석</h2>
        <span className="en">Focus · Deep Dive</span>
        <span className="grow" />
        <span className="en" style={{ color: "var(--accent)" }}>주가 동향 · 시나리오</span>
      </div>

      <div className="focus">
        <div className="focus-top">
          <div className="focus-id">
            <span className="nm">{focus.name}</span>
            <span className="tk">{focus.ticker}</span>
          </div>
          <div className="focus-px">
            <span className="p">{money(focus.price.value, cur)}</span>
            <span className="c" style={{ color: up ? "var(--up)" : "var(--down)" }}>
              {up ? "▲ " : "▼ "}
              {up ? "+" : ""}
              {focus.price.change_pct.toFixed(2)}%
              {focus.price.change_abs ? `  (${up ? "+" : "−"}${Math.abs(focus.price.change_abs).toLocaleString()})` : ""}
              {focus.price.as_of ? `  · ${focus.price.as_of}` : ""}
            </span>
          </div>
          <div className="focus-meta">
            {focus.rating && <span className="rt">{focus.rating}</span>}
            {focus.target && (
              <span className="tg">
                목표가 {compact(focus.target.avg, focus.target.currency)}
                {focus.target.high ? ` (범위 ${compact(focus.target.low ?? 0, focus.target.currency)}~${compact(focus.target.high, focus.target.currency)})` : ""}
              </span>
            )}
            {focus.price_context && <span className="cx">{focus.price_context}</span>}
          </div>
        </div>

        <div className="focus-body">
          {focus.price_series.length >= 2 && (
            <div style={{ marginBottom: 20 }}>
              <div className="panel-title">주가 추이 · Price Trend</div>
              <PriceChart series={focus.price_series} prefix={cur === "USD" ? "$" : "₩"} />
            </div>
          )}

          {focus.thesis && <p className="focus-thesis" dangerouslySetInnerHTML={{ __html: focus.thesis }} />}

          {(focus.drivers.length > 0 || focus.risks.length > 0) && (
            <div className="dr-grid">
              <DriverList title="상승 동인 · Drivers" rows={focus.drivers} kind="pos" />
              <DriverList title="하락 리스크 · Risks" rows={focus.risks} kind="neg" />
            </div>
          )}

          {focus.scenarios.length > 0 && (
            <>
              <div className="panel-title" style={{ marginTop: 26 }}>시나리오 · Scenarios</div>
              <div className="scen">
                {focus.scenarios.map((s, i) => (
                  <div key={i} className={`sc ${s.kind}`}>
                    <div className="kd">{SCEN_LABEL[s.kind]}</div>
                    <div className="lv">{s.label}</div>
                    <div className="cd">{s.condition}</div>
                    <div className="im">→ {s.implication}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {focus.catalysts.length > 0 && (
            <>
              <div className="panel-title" style={{ marginTop: 26 }}>촉매 일정 · Catalysts</div>
              <div className="catl">
                {focus.catalysts.map((c, i) => (
                  <div key={i} className="c">
                    <span className="dt">{c.date}</span>
                    <span className="ev">{c.event}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {focus.watch.length > 0 && (
            <>
              <div className="panel-title" style={{ marginTop: 26 }}>모니터링 지표 · What to Watch</div>
              <div className="watch">
                {focus.watch.map((w, i) => (
                  <div key={i} className="w">
                    <span className="n">{String(i + 1).padStart(2, "0")}</span>
                    {w}
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="disclaim">
            본 심층 분석은 공개 자료를 취합한 정보 제공용이며 특정 종목의 매수·매도를 권유하지 않습니다. 시나리오·목표가는
            인용 매체·애널리스트 컨센서스 기준이며 실제 결과와 다를 수 있습니다. 투자 판단과 책임은 이용자 본인에게 있습니다.
          </p>
        </div>
      </div>
    </section>
  );
}
