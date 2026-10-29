import { useEffect, useState } from "react";
import { t } from "@shared/i18n";
import { alertError } from "../errors";
import { CloudLockIcon, MonitorIcon } from "../icons";

export interface WelcomePageProps {
  /** Local mode: remember the choice and open the picker. */
  onUseLocal: () => Promise<void>;
  /** Google sign-in in the system browser. Resolves when signed in (then the encryption setup or unlock opens). */
  onSignIn: () => Promise<void>;
  /** Open the privacy page of the user guide in the browser. */
  onOpenPrivacy: () => void;
}

/** First start (or after sign-out): choose where data is kept. Replaces the login page (plan Q1). */
export function WelcomePage({ onUseLocal, onSignIn, onOpenPrivacy }: WelcomePageProps) {
  const [busy, setBusy] = useState<"local" | "cloud" | null>(null);
  const text = t().welcome;

  useEffect(() => {
    document.title = t().welcome.windowTitle;
  }, []);

  async function run(choice: "local" | "cloud", action: () => Promise<void>) {
    setBusy(choice);
    try {
      await action();
    } catch (error) {
      await alertError(error);
      setBusy(null);
    }
  }

  return (
    <main className="flow">
      <header className="flow-header">
        <span className="brand mono">SHIODOKI</span>
        <h1>{text.title}</h1>
        <p className="sub">{text.subtitle}</p>
      </header>

      <div className="choice-list">
        <button
          type="button"
          className="choice choice-primary"
          disabled={busy !== null}
          onClick={() => void run("local", onUseLocal)}
        >
          <span className="choice-icon">
            <MonitorIcon />
          </span>
          <span className="choice-text">
            <span className="choice-title">
              {text.localTitle}
              <span className="badge-ok">{text.recommended}</span>
            </span>
            <span className="choice-body">{text.localBody}</span>
          </span>
        </button>

        <button
          type="button"
          className="choice"
          disabled={busy !== null}
          aria-busy={busy === "cloud"}
          onClick={() => void run("cloud", onSignIn)}
        >
          <span className="choice-icon">
            <CloudLockIcon />
          </span>
          <span className="choice-text">
            <span className="choice-title">{text.cloudTitle}</span>
            <span className="choice-body">{busy === "cloud" ? t().login.waiting : text.cloudBody}</span>
          </span>
        </button>
      </div>

      <footer className="flow-footer flow-footer-note">
        <span>{text.changeLater}</span>
        <button type="button" className="link-button" onClick={onOpenPrivacy}>
          {text.privacy}
        </button>
      </footer>
    </main>
  );
}
