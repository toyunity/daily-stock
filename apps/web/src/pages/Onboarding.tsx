import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { PreferenceEditor } from "../components/PreferenceEditor";
import { EMPTY_PREFS, loadPreferences, savePreferences, repersonalize } from "../lib/preferences";

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(EMPTY_PREFS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadPreferences(user.id).then(setPrefs);
  }, [user]);

  async function save() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await savePreferences(user.id, prefs);
      void repersonalize(); // fire-and-forget; must not block navigation
      navigate("/");
    } catch (e) {
      setError((e as Error).message ?? "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">관심 분야 설정</h1>
      <p className="mt-2 text-sm text-slate-400">
        선택한 섹터·토픽·종목을 기준으로 매일 리포트가 개인화됩니다. 언제든 설정에서 바꿀 수 있어요.
      </p>
      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <PreferenceEditor value={prefs} onChange={setPrefs} />
      </div>
      {error && <p className="mt-4 text-sm text-red-400">저장 오류: {error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={() => navigate("/")} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white">
          건너뛰기
        </button>
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "저장 중…" : "저장하고 시작하기"}
        </button>
      </div>
    </div>
  );
}
