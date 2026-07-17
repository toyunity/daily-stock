import type { ReportContent, Fact, IndexQuote } from "@daily-stock/shared";
import { IndexChangeChart } from "./charts/IndexChart";
import { SectionChart } from "./charts/SectionChart";
import { GeopoliticsSection } from "./GeopoliticsSection";

function IndexTile({ q }: { q: IndexQuote }) {
  const up = q.change_pct >= 0;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="eyebrow text-slate-500">{q.name}</div>
      <div className="tnum mt-1.5 font-mono text-xl font-semibold">{q.value.toLocaleString()}</div>
      <div className={`tnum mt-0.5 font-mono text-sm font-medium ${up ? "text-up" : "text-down"}`}>
        {up ? "▲" : "▼"} {Math.abs(q.change_abs).toLocaleString()} ({up ? "+" : ""}
        {q.change_pct.toFixed(2)}%)
      </div>
    </div>
  );
}

function SourceBadges({ fact }: { fact: Fact }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {fact.tickers.map((t) => (
        <span key={t} className="tnum rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">
          {t}
        </span>
      ))}
      {fact.sources.map((s, i) => (
        <a
          key={i}
          href={s.url}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-sky-950 px-1.5 py-0.5 text-[11px] text-sky-300 hover:bg-sky-900"
        >
          {s.name} ↗
        </a>
      ))}
    </div>
  );
}

function FactItem({ fact }: { fact: Fact }) {
  return (
    <li className="border-l-2 border-slate-700 pl-3">
      <p className="font-report text-[15px] leading-relaxed text-slate-200">{fact.fact}</p>
      <SourceBadges fact={fact} />
    </li>
  );
}

function SectionHead({ label }: { label: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <span className="eyebrow text-accent">{label}</span>
      <span className="h-px flex-1 bg-slate-800" />
    </div>
  );
}

export function ReportView({
  content,
  cardImageUrl,
  coverImageUrl,
  showCover = true,
}: {
  content: ReportContent;
  cardImageUrl?: string | null;
  coverImageUrl?: string | null;
  showCover?: boolean;
}) {
  const { market_summary, headlines, sections, geopolitics } = content;
  return (
    <div className="space-y-10">
      {showCover && coverImageUrl && (
        <img
          src={coverImageUrl}
          alt="리포트 헤더"
          className="aspect-[1200/420] w-full rounded-2xl border border-slate-800 object-cover"
        />
      )}

      {/* BLUF summary */}
      <section className="rounded-2xl border border-slate-800 border-l-[3px] border-l-accent bg-slate-900 px-6 py-5">
        <div className="eyebrow text-accent">핵심 요약 · Bottom Line</div>
        <p className="font-report mt-2 text-[17px] leading-relaxed text-slate-100">{content.headline_summary}</p>
      </section>

      {/* Market summary */}
      {market_summary.indices.length > 0 && (
        <section>
          <SectionHead label="시장 지표 · Markets" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {market_summary.indices.map((q) => (
              <IndexTile key={q.symbol} q={q} />
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="eyebrow mb-2 text-slate-500">지수 등락률</div>
            <IndexChangeChart indices={market_summary.indices} />
          </div>
        </section>
      )}

      {/* Geopolitics briefing */}
      {geopolitics && <GeopoliticsSection brief={geopolitics} />}

      {/* Headlines */}
      {headlines.length > 0 && (
        <section>
          <SectionHead label="핵심 헤드라인 · Headlines" />
          <ul className="space-y-3">
            {headlines.map((f, i) => (
              <FactItem key={i} fact={f} />
            ))}
          </ul>
        </section>
      )}

      {/* Sector sections */}
      {sections.map((s, i) => (
        <section key={i} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-report text-lg font-semibold">{s.title}</h2>
          <ul className="mt-3 space-y-3">
            {s.facts.map((f, j) => (
              <FactItem key={j} fact={f} />
            ))}
          </ul>
          {s.chart && <SectionChart spec={s.chart} />}
        </section>
      ))}

      {cardImageUrl && (
        <section>
          <SectionHead label="공유용 카드 · Share" />
          <img src={cardImageUrl} alt="Report card" className="w-full max-w-sm rounded-xl border border-slate-800" />
          <a href={cardImageUrl} download className="mt-2 inline-block text-sm text-sky-400 hover:underline">
            이미지 다운로드 ↓
          </a>
        </section>
      )}

      <footer className="border-t border-slate-800 pt-4 text-xs text-slate-500">
        <p>{content.neutrality_note}</p>
        <p className="mt-1">{content.disclaimer}</p>
      </footer>
    </div>
  );
}
