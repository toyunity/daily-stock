import { useState } from "react";
import { SECTORS, TOPICS, POPULAR_TICKERS } from "../lib/constants";

export interface PrefValue {
  sectors: string[];
  tickers: string[];
  topics: string[];
  ai_header: boolean;
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
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

export function PreferenceEditor({
  value,
  onChange,
}: {
  value: PrefValue;
  onChange: (v: PrefValue) => void;
}) {
  const [tickerInput, setTickerInput] = useState("");

  const toggle = (key: "sectors" | "topics", id: string) => {
    const set = new Set(value[key]);
    set.has(id) ? set.delete(id) : set.add(id);
    onChange({ ...value, [key]: [...set] });
  };

  const toggleTicker = (t: string) => {
    const up = t.toUpperCase();
    const set = new Set(value.tickers);
    set.has(up) ? set.delete(up) : set.add(up);
    onChange({ ...value, tickers: [...set] });
  };

  const addTicker = () => {
    const t = tickerInput.trim().toUpperCase();
    if (t && !value.tickers.includes(t)) onChange({ ...value, tickers: [...value.tickers, t] });
    setTickerInput("");
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-300">관심 섹터</h3>
        <div className="flex flex-wrap gap-2">
          {SECTORS.map((s) => (
            <Chip key={s.id} label={s.label} active={value.sectors.includes(s.id)} onClick={() => toggle("sectors", s.id)} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-300">관심 토픽</h3>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <Chip key={t.id} label={t.label} active={value.topics.includes(t.id)} onClick={() => toggle("topics", t.id)} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-300">관심 종목 (티커)</h3>
        <div className="mb-3 flex flex-wrap gap-2">
          {POPULAR_TICKERS.map((t) => (
            <Chip key={t} label={t} active={value.tickers.includes(t)} onClick={() => toggleTicker(t)} />
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTicker())}
            placeholder="티커 직접 추가 (예: PLTR)"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
          <button type="button" onClick={addTicker} className="rounded-lg bg-slate-800 px-4 text-sm hover:bg-slate-700">
            추가
          </button>
        </div>
        {value.tickers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {value.tickers.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-xs">
                {t}
                <button type="button" onClick={() => toggleTicker(t)} className="text-slate-400 hover:text-white">
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
          AI 헤더 일러스트 생성 (선택)
        </label>
      </section>
    </div>
  );
}
