import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ReportContent } from "@daily-stock/shared";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { ReportView } from "../components/ReportView";

interface LoadedReport {
  content: ReportContent;
  cardImageUrl: string | null;
  date: string;
}

async function fetchLatestReport(userId: string): Promise<LoadedReport | null> {
  // Prefer the user's personalized report; fall back to the master report.
  const { data: personal } = await supabase
    .from("user_reports")
    .select("content, report_date")
    .eq("user_id", userId)
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: master } = await supabase
    .from("daily_reports")
    .select("content, card_image_url, report_date")
    .eq("status", "ready")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (personal && master && personal.report_date === master.report_date) {
    return {
      content: personal.content as ReportContent,
      cardImageUrl: (master.card_image_url as string) ?? null,
      date: personal.report_date,
    };
  }
  if (master) {
    return {
      content: master.content as ReportContent,
      cardImageUrl: (master.card_image_url as string) ?? null,
      date: master.report_date,
    };
  }
  return null;
}

export default function TodayReport() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["latest-report", user?.id],
    queryFn: () => fetchLatestReport(user!.id),
    enabled: !!user,
  });

  if (isLoading) return <ReportSkeleton />;
  if (error) return <ErrorState message={String((error as Error).message)} />;
  if (!data) return <EmptyState />;

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">오늘의 리포트</h1>
        <span className="text-sm text-slate-400">미국장 {data.date}</span>
      </div>
      <ReportView content={data.content} cardImageUrl={data.cardImageUrl} />
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-40 rounded bg-slate-800" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-800" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-slate-800" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
      <div className="text-4xl">📭</div>
      <h2 className="mt-3 text-lg font-semibold">아직 생성된 리포트가 없습니다</h2>
      <p className="mt-1 text-sm text-slate-400">
        매일 오전 06:15에 새 리포트가 생성됩니다. 먼저 관심 분야를 설정해 보세요.
      </p>
      <Link to="/onboarding" className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500">
        관심 분야 설정하기
      </Link>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-900 bg-red-950/40 p-6 text-sm text-red-300">
      리포트를 불러오지 못했습니다: {message}
    </div>
  );
}
