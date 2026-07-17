import { useState } from "react";
import { SECTORS, TOPICS } from "../lib/constants";
import { searchCompanies, SECTOR_TICKERS, COMPANY_DIRECTORY } from "../lib/companies";

export interface PrefValue {
  sectors: string[];
  tickers: string[];
  topics: string[];
  ai_header: boolean;
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
          : "border-slate-700 text-slate-300 hover:border-slate-500"
      }`}
    >
      {label}
    </button>
  );
}

function tickerLabel(t: string): string {
  const c = COMPANY_DIRECTORY.find((x) => x.ticker === t);
  return c ? `${t} · ${c.name}` : t;
}

export function PreferenceEditor({
  value,
  onChange,
}: {
  value: PrefValue;
  onChange: (v: PrefValue) => void;
}) {
  const [query, setQuery] = useState("");
  const suggestions = searchCompanies(query);

  const addTickers = (base: string[], toAdd: string[]) => {
    const set = new Set(base);
    for (const t of toAdd) set.add(t.toUpperCase());
    return [...set];
  };

  const toggleTopic = (id: string) => {
    const set = new Set(value.topics);
    set.has(id) ? set.delete(id) : set.add(id);
    onChange({ ...value, topics: [...set] });
  };

  const toggleSector = (id: string) => {
    const set = new Set(value.sectors);
    const activating = !set.has(id);
    activating ? set.add(id) : set.delete(id);
    // Auto-register related tickers when a sector with a mapping is turned on.
    const related = SECTOR_TICKERS[id] ?? [];
    const tickers = activating ? addTickers(value.tickers, related) : value.tickers;
    onChange({ ...value, sectors: [...set], tickers });
  };

  const addTicker = (t: string) => {
    onChange({ ...value, tickers: addTickers(value.tickers, [t]) });
    setQuery("");
  };

  const removeTicker = (t: string) => {
    onChange({ ...value, tickers: value.tickers.filter((x) => x !== t.toUpperCase()) });
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-300">관심 섹터</h3>
        <div className="flex flex-wrap gap-2">
          {SECTORS.map((s) => (
            <Chip key={s.id} label={s.label} active={value.sectors.includes(s.id)} onClick={() => toggleSector(s.id)} />
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          일부 섹터는 선택 시 관련 종목이 자동 추가됩니다 (예: 메모리 반도체 → MU·WDC·STX·SIMO).
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-300">관심 토픽</h3>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <Chip key={t.id} label={t.label} active={value.topics.includes(t.id)} onClick={() => toggleTopic(t.id)} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-300">관심 종목</h3>
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (suggestions[0]) addTicker(suggestions[0].ticker);
                else if (query.trim()) addTicker(query.trim());
              }
            }}
            placeholder="회사명 또는 티커 검색 (예: 마이크론, 엔비디아, NVDA)"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
          {suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
              {suggestions.map((c) => (
                <li key={c.ticker}>
                  <button
                    type="button"
                    onClick={() => addTicker(c.ticker)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-800"
                  >
                    <span className="text-slate-200">{c.name}</span>
                    <span className="ml-3 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-emerald-300">{c.ticker}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {value.tickers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {value.tickers.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs">
                {tickerLabel(t)}
                <button type="button" onClick={() => removeTicker(t)} className="text-slate-400 hover:text-white">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section>
        <label className="flex items-center gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={value.ai_header}
            onChange={(e) => onChange({ ...value, ai_header: e.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-slate-950"
          />
          AI 헤더 일러스트 표시
        </label>
      </section>
    </div>
  );
}
