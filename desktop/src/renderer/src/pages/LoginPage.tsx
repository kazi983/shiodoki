import { useEffect, useState } from "react";
import { t } from "@shared/i18n";
import { alertError } from "../errors";

/** First launch (or after logout): sign in with Google. */
export function LoginPage() {
  const [busy, setBusy] = useState(false);
  const text = t().login;

  useEffect(() => {
    document.title = t().login.windowTitle;
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
      <h1>Shiodoki</h1>
      <p className="sub">{text.description(<br key="br" />)}</p>
      <button className="btn btn-primary btn-large" onClick={() => void signIn()} disabled={busy}>
        {busy ? text.waiting : text.signIn}
      </button>
      {busy && <p className="hint">{text.hint}</p>}
    </main>
  );
}
