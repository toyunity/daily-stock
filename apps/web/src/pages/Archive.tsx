import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReportContent } from "@daily-stock/shared";
import { supabase } from "../lib/supabase";
import { ReportView } from "../components/ReportView";

interface ArchiveRow {
  report_date: string;
  content: ReportContent;
  card_image_url: string | null;
  cover_image_url: string | null;
}

async function fetchArchive(): Promise<ArchiveRow[]> {
  const { data, error } = await supabase
    .from("daily_reports")
    .select("report_date, content, card_image_url, cover_image_url")
    .eq("status", "ready")
    .order("report_date", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data as ArchiveRow[]) ?? [];
}

export default function Archive() {
  const { data, isLoading } = useQuery({ queryKey: ["archive"], queryFn: fetchArchive });
  const [selected, setSelected] = useState<string | null>(null);

  if (isLoading) return <div className="text-slate-400">불러오는 중…</div>;
  const rows = data ?? [];
  const active = rows.find((r) => r.report_date === selected);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">리포트 아카이브</h1>
      {active ? (
        <div>
          <button onClick={() => setSelected(null)} className="mb-4 text-sm text-sky-400 hover:underline">
            ← 목록으로
          </button>
          <ReportView
            content={active.content}
            cardImageUrl={active.card_image_url}
            coverImageUrl={active.cover_image_url}
            title={`${active.report_date} 리포트`}
          />
        </div>
      ) : (
        <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900">
          {rows.map((r) => (
            <li key={r.report_date}>
              <button
                onClick={() => setSelected(r.report_date)}
                className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-800/50"
              >
                <span className="font-medium">{r.report_date}</span>
                <span className="line-clamp-1 max-w-xs text-sm text-slate-400">
                  {r.content.headline_summary}
                </span>
              </button>
            </li>
          ))}
          {rows.length === 0 && <li className="px-5 py-8 text-center text-slate-500">아직 리포트가 없습니다.</li>}
        </ul>
      )}
    </div>
  );
}
