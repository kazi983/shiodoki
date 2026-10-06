import { useEffect, useState } from "react";
import { alertError } from "../errors";

/** First launch (or after logout): sign in with Google. */
export function LoginPage() {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "30min Task Timer - ログイン";
  }, []);

  async function signIn() {
    setBusy(true);
    try {
      await window.api.auth.signIn();
    } catch (error) {
      await alertError(error);
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <h1>30min Task Timer</h1>
      <p className="sub">
        タスクを Google アカウントに保存して、
        <br />
        スマホからも確認・編集できるようにします。
      </p>
      <button className="btn btn-primary btn-large" onClick={() => void signIn()} disabled={busy}>
        {busy ? "ブラウザでログインしてください…" : "Google でログイン"}
      </button>
      {busy && <p className="hint">ログインが終わると、この画面は自動で閉じます。</p>}
    </main>
  );
}
