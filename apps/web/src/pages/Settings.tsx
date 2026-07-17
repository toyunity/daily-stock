import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { PreferenceEditor } from "../components/PreferenceEditor";
import { EMPTY_PREFS, loadPreferences, savePreferences, repersonalize } from "../lib/preferences";

export default function Settings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(EMPTY_PREFS);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) loadPreferences(user.id).then(setPrefs);
  }, [user]);

  async function save() {
    if (!user) return;
    setBusy(true);
    setSaved(false);
    await savePreferences(user.id, prefs);
    await repersonalize();
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">설정</h1>
      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <PreferenceEditor value={prefs} onChange={setPrefs} />
      </div>
      <div className="mt-6 flex items-center justify-end gap-4">
        {saved && <span className="text-sm text-emerald-400">저장되었습니다 ✓</span>}
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "저장 중…" : "변경사항 저장"}
        </button>
      </div>
    </div>
  );
}
