import type { ReportContent, Fact, IndexQuote, MacroPoint, Mover } from "@daily-stock/shared";
import { GeopoliticsSection } from "./GeopoliticsSection";
import "../styles/report.css";

function sparkPoints(up: boolean): string {
  return up ? "0,22 14,18 28,20 42,12 56,8 72,4" : "0,6 14,9 28,7 42,14 56,18 72,22";
}

function IndexCell({ q }: { q: IndexQuote }) {
  const up = q.change_pct >= 0;
  const color = up ? "var(--up)" : "var(--down)";
  return (
    <div className="idx">
      <div className="name">{q.name}</div>
      <div className="val">{q.value.toLocaleString()}</div>
      <div className="chg" style={{ color }}>
        <span>{up ? "▲" : "▼"}</span>
        <span>
          {up ? "+" : ""}
          {q.change_pct.toFixed(2)}%
        </span>
        <span style={{ color: "var(--ink-faint)" }}>
          {up ? "+" : "−"}
          {Math.abs(q.change_abs).toLocaleString()}
        </span>
      </div>
      <svg className="spark" width="72" height="26" viewBox="0 0 72 26" fill="none">
        <polyline points={sparkPoints(up)} stroke={up ? "#1f7a4a" : "#b0301f"} strokeWidth="1.6" fill="none" />
      </svg>
    </div>
  );
}

function MacroCell({ m }: { m: MacroPoint }) {
  const cls = m.change > 0 ? "d up" : m.change < 0 ? "d down" : "d";
  return (
    <div className="m">
      <div className="k">{m.label}</div>
      <div className="v">
        {m.unit === "$" ? "$" : ""}
        {m.value.toLocaleString()}
        {m.unit && m.unit !== "$" ? m.unit : ""}
      </div>
      <div className={cls} style={m.change === 0 ? { color: "var(--ink-faint)" } : undefined}>
        {m.change > 0 ? "▲ " : m.change < 0 ? "▼ " : "— "}
        {m.change !== 0 ? Math.abs(m.change).toLocaleString() : "유지"}
      </div>
    </div>
  );
}

function MoverRow({ label, rows, up }: { label: string; rows: Mover[]; up: boolean }) {
  if (!rows.length) return null;
  return (
    <div className="losers">
      <div className="lab" style={up ? { color: "var(--up)" } : undefined}>
        {label}
      </div>
      <div className="items">
        {rows.map((r) => (
          <div key={r.ticker} className={up ? "li up" : "li"}>
            <span className="tk">{r.ticker}</span>
            <span className="pc">
              {r.pct >= 0 ? "+" : ""}
              {r.pct.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceBadges({ fact }: { fact: Fact }) {
  return (
    <span className="s">
      {fact.tickers.map((t) => (
        <span key={t} className="tk">
          {t}
        </span>
      ))}
      {fact.sources.map((s, i) => (
        <a key={i} href={s.url} target="_blank" rel="noreferrer">
          {s.name} ↗
        </a>
      ))}
    </span>
  );
}

function splitTitle(title: string): [string, string] {
  const idx = title.lastIndexOf(" ");
  if (idx === -1) return ["", title];
  return [title.slice(0, idx + 1), title.slice(idx + 1)];
}

export function ReportView({
  content,
  cardImageUrl,
  coverImageUrl,
  showCover = true,
  title = "오늘의 리포트",
}: {
  content: ReportContent;
  cardImageUrl?: string | null;
  coverImageUrl?: string | null;
  showCover?: boolean;
  title?: string;
}) {
  const { market_summary, headlines, sections, geopolitics } = content;
  const summary = content.headline_summary || "";
  const dc = summary.slice(0, 1);
  const rest = summary.slice(1);
  const [titlePre, titleAmp] = splitTitle(title);

  return (
    <div className="report-doc">
      <div className="wrap">
        {/* FOLIO */}
        <div className="folio">
          <span>
            데일리 브리핑 <b>· DAILY BRIEFING</b>
          </span>
          <span>미국장 마감 기준</span>
          <span>
            <b>{content.date}</b>
          </span>
        </div>

        {/* MASTHEAD */}
        <header className="masthead">
          <div className="eyebrow">데일리 브리핑 · DAILY BRIEFING</div>
          <h1 className="title">
            {titlePre}
            <span className="amp">{titleAmp}</span>
          </h1>
          <p className="subline">미국 증시와 지정학 리스크를 하나의 시야로 — 팩트에 근거한 임원용 데일리 브리핑.</p>
          <div className="chips">
            <span className="chip">
              <span className="dot" />미국장 {content.date}
            </span>
            <span className="chip">
              <span className="dot" />팩트 기반 · 출처 표기
            </span>
            <span className="chip k">
              <span className="dot" />정치적 중립
            </span>
          </div>
        </header>
        <hr className="rule-double" />

        {showCover && coverImageUrl && <img className="cover-img" src={coverImageUrl} alt="리포트 헤더" />}

        {/* BLUF */}
        {summary && (
          <section className="sec" style={{ marginTop: 34 }}>
            <div className="bluf">
              <div className="tag">핵심 요약 · Bottom Line Up Front</div>
              <p>
                <span className="dc">{dc}</span>
                {rest}
              </p>
            </div>
          </section>
        )}

        {/* MARKETS */}
        {market_summary.indices.length > 0 && (
          <section className="sec">
            <div className="sec-head">
              <h2>시장 지표</h2>
              <span className="en">US Equities · Close</span>
              <span className="grow" />
            </div>
            <div className="idx-grid">
              {market_summary.indices.map((q) => (
                <IndexCell key={q.symbol} q={q} />
              ))}
            </div>
            {market_summary.macro.length > 0 && (
              <div className="macro">
                {market_summary.macro.map((m, i) => (
                  <MacroCell key={i} m={m} />
                ))}
              </div>
            )}
            <MoverRow label="상승 상위" rows={market_summary.movers.gainers} up />
            <MoverRow label="하락 상위" rows={market_summary.movers.losers} up={false} />
          </section>
        )}

        {/* GEOPOLITICS */}
        {geopolitics && <GeopoliticsSection brief={geopolitics} />}

        {/* HEADLINES */}
        {headlines.length > 0 && (
          <section className="sec">
            <div className="sec-head">
              <h2>핵심 헤드라인</h2>
              <span className="en">Top Stories · Sourced</span>
            </div>
            <div className="heads">
              {headlines.map((f, i) => (
                <div key={i} className="head">
                  <span className="rk">{String(i + 1).padStart(2, "0")}</span>
                  <span className="ht">{f.fact}</span>
                  <span className="srcs">
                    {f.sources.map((s, j) => (
                      <a key={j} className="badge" href={s.url} target="_blank" rel="noreferrer">
                        {s.name}
                      </a>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SECTOR DETAIL */}
        {sections.length > 0 && (
          <section className="sec">
            <div className="sec-head">
              <h2>섹터 브리핑</h2>
              <span className="en">Sector Detail</span>
            </div>
            <div className="sectors">
              {sections.map((s, i) => (
                <div key={i} className="sector">
                  <div className="sh">
                    <span className="st">{s.title}</span>
                  </div>
                  <ul>
                    {s.facts.map((f, j) => (
                      <li key={j}>
                        {f.fact}
                        <SourceBadges fact={f} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {cardImageUrl && (
          <section className="sec">
            <div className="sec-head">
              <h2>공유용 카드</h2>
              <span className="en">Share</span>
            </div>
            <img className="cover-img" src={cardImageUrl} alt="리포트 카드" style={{ maxWidth: 420 }} />
          </section>
        )}

        {/* COLOPHON */}
        <footer className="colophon">
          <span>
            <b>{title}</b> · 데일리 브리핑
          </span>
          <span>{content.neutrality_note}</span>
          <span>
            <b>{content.date}</b> · 미국장 마감 기준
          </span>
        </footer>
      </div>
    </div>
  );
}
