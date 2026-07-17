import type { ReportContent, Fact, IndexQuote } from "@daily-stock/shared";
import { IndexChangeChart } from "./charts/IndexChart";
import { SectionChart } from "./charts/SectionChart";

function IndexCard({ q }: { q: IndexQuote }) {
  const up = q.change_pct >= 0;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs text-slate-400">{q.name}</div>
      <div className="mt-1 text-xl font-semibold">{q.value.toLocaleString()}</div>
      <div className={`mt-1 text-sm font-medium ${up ? "text-up" : "text-down"}`}>
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
        <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">
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
      <p className="text-sm leading-relaxed text-slate-200">{fact.fact}</p>
      <SourceBadges fact={fact} />
    </li>
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
  const { market_summary, headlines, sections } = content;
  return (
    <div className="space-y-8">
      {showCover && coverImageUrl && (
        <img
          src={coverImageUrl}
          alt="리포트 헤더"
          className="aspect-[1200/420] w-full rounded-2xl border border-slate-800 object-cover"
        />
      )}
      <section>
        <p className="text-slate-300">{content.headline_summary}</p>
      </section>

      {market_summary.indices.length > 0 && (
        <section>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {market_summary.indices.map((q) => (
              <IndexCard key={q.symbol} q={q} />
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-300">지수 등락률</h3>
            <IndexChangeChart indices={market_summary.indices} />
          </div>
        </section>
      )}

      {headlines.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">핵심 헤드라인</h2>
          <ul className="space-y-3">
            {headlines.map((f, i) => (
              <FactItem key={i} fact={f} />
            ))}
          </ul>
        </section>
      )}

      {sections.map((s, i) => (
        <section key={i} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-bold">{s.title}</h2>
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
          <h3 className="mb-2 text-sm font-semibold text-slate-300">공유용 리포트 카드</h3>
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
