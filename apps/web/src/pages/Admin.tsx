import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

interface Row {
  id: string;
  email: string;
  is_approved: boolean;
  role: "user" | "admin";
  created_at: string;
}

async function fetchProfiles(): Promise<Row[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, is_approved, role, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]) ?? [];
}

export default function Admin() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-profiles"], queryFn: fetchProfiles });

  const setApproval = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_approved: approved }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-profiles"] }),
  });

  if (isLoading) return <div className="text-slate-400">불러오는 중…</div>;
  const rows = data ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">관리자 · 사용자 승인</h1>
      <div className="overflow-hidden rounded-2xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">이메일</th>
              <th className="px-4 py-3 text-left">역할</th>
              <th className="px-4 py-3 text-left">상태</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.id} className="bg-slate-950/40">
                <td className="px-4 py-3">{r.email}</td>
                <td className="px-4 py-3 text-slate-400">{r.role}</td>
                <td className="px-4 py-3">
                  {r.is_approved ? (
                    <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-emerald-300">승인됨</span>
                  ) : (
                    <span className="rounded-full bg-amber-950 px-2 py-0.5 text-amber-300">대기</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setApproval.mutate({ id: r.id, approved: !r.is_approved })}
                    disabled={setApproval.isPending}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      r.is_approved ? "bg-slate-800 hover:bg-slate-700" : "bg-emerald-600 hover:bg-emerald-500"
                    }`}
                  >
                    {r.is_approved ? "승인 취소" : "승인"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  가입한 사용자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
