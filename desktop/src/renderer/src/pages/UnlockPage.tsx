import { useEffect, useState, type FormEvent } from "react";
import { t } from "@shared/i18n";
import { alertError } from "../errors";
import { LockIcon } from "../icons";
import { PasswordField, SegmentedTabs, type SecretKind } from "../encryptionParts";

export interface UnlockPageProps {
  /** Signed-in Google account, shown so the user knows which data they unlock. */
  email: string;
  /** Unwrap the data key and keep it on this PC. Resolves to false when the secret is wrong. */
  onUnlock: (kind: SecretKind, secret: string) => Promise<boolean>;
  onSignOut: () => Promise<void>;
}

/** First sign-in on another PC: unlock with the passphrase or the recovery key (plan Q11). */
export function UnlockPage({ email, onUnlock, onSignOut }: UnlockPageProps) {
  const [kind, setKind] = useState<SecretKind>("passphrase");
  const [secret, setSecret] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const text = t().encryption;

  useEffect(() => {
    document.title = t().encryption.unlockWindowTitle;
  }, []);

  function switchKind(next: SecretKind) {
    setKind(next);
    setSecret("");
    setWrong(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!secret || busy) return;
    setBusy(true);
    try {
      setWrong(!(await onUnlock(kind, secret)));
    } catch (error) {
      await alertError(error);
    } finally {
      setBusy(false);
    }
  }

  const label = kind === "passphrase" ? text.passphrase : text.recoveryKey;
  const error = wrong ? (kind === "passphrase" ? text.wrongPassphrase : text.wrongRecoveryKey) : null;

  return (
    <form className="flow" onSubmit={(e) => void submit(e)}>
      <header className="flow-header">
        <span className="flow-icon">
          <LockIcon size={22} />
        </span>
        <h1>{text.unlockTitle}</h1>
        <p className="sub">{text.unlockBody}</p>
        <p className="account">{email}</p>
      </header>

      <SegmentedTabs
        label={text.methodLabel}
        options={[
          { value: "passphrase", label: text.passphrase },
          { value: "recoveryKey", label: text.recoveryKey },
        ]}
        value={kind}
        onChange={switchKind}
      />

      <PasswordField
        key={kind}
        label={label}
        value={secret}
        onChange={(value) => {
          setSecret(value);
          setWrong(false);
        }}
        autoComplete={kind === "passphrase" ? "current-password" : "off"}
        error={error}
        autoFocus
      />

      <footer className="flow-footer">
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void onSignOut()}>
          {t().common.logout}
        </button>
        <button type="submit" className="btn btn-primary btn-wide" disabled={!secret || busy} aria-busy={busy}>
          {text.unlock}
        </button>
      </footer>
    </form>
  );
}
