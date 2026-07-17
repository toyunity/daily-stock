import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function signInGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  }

  async function signInMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-2xl font-bold">📈 Daily Stock</h1>
        <p className="mt-2 text-sm text-slate-400">
          미국 증시 팩트 리포트. 승인된 사용자만 이용할 수 있습니다.
        </p>

        <button
          onClick={signInGoogle}
          className="mt-6 w-full rounded-lg bg-white px-4 py-2.5 font-medium text-slate-900 hover:bg-slate-100"
        >
          Google로 계속하기
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
          <div className="h-px flex-1 bg-slate-800" /> 또는 <div className="h-px flex-1 bg-slate-800" />
        </div>

        {sent ? (
          <p className="rounded-lg bg-emerald-950/50 p-3 text-sm text-emerald-300">
            {email} 으로 로그인 링크를 보냈습니다. 메일함을 확인하세요.
          </p>
        ) : (
          <form onSubmit={signInMagicLink} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-slate-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-slate-800 px-4 py-2.5 font-medium hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? "전송 중…" : "이메일 매직링크 받기"}
            </button>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
