import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Pending() {
  const { session, profile, loading, signOut } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.is_approved) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <div className="text-4xl">⏳</div>
        <h1 className="mt-4 text-xl font-bold">승인 대기 중</h1>
        <p className="mt-2 text-sm text-slate-400">
          계정 <span className="text-slate-200">{profile?.email}</span> 은 관리자 승인 후
          리포트를 열람할 수 있습니다. 승인되면 자동으로 접근이 열립니다.
        </p>
        <button
          onClick={signOut}
          className="mt-6 rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
