import { useEffect, useState, type FormEvent } from "react";
import { t } from "@shared/i18n";
import { isPassphraseValid } from "@shared/passphrase";
import { alertError } from "../errors";
import { PassphraseRules, PasswordField, RecoveryKeyPanel, StepHeader } from "../encryptionParts";

export interface EncryptionSetupPageProps {
  /**
   * Step 1 → 2: create the data key, wrap it with the passphrase and a new recovery key, and resolve to the recovery
   * key to show ("XXXX-XXXX-…").
   */
  onCreate: (passphrase: string) => Promise<string>;
  onCopy: (recoveryKey: string) => Promise<void>;
  onSaveToFile: (recoveryKey: string) => Promise<void>;
  /** After "I've saved my recovery key": close the window and start syncing. */
  onDone: () => void;
  /** The only way out before the setup is finished (no signed-in state without a key). */
  onSignOut: () => Promise<void>;
}

/** First cloud sign-in: set a passphrase (step 1), then save the recovery key (step 2). Plan Q11, Q12. */
export function EncryptionSetupPage({ onCreate, onCopy, onSaveToFile, onDone, onSignOut }: EncryptionSetupPageProps) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const text = t().encryption;

  useEffect(() => {
    document.title = t().encryption.setupWindowTitle;
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isPassphraseValid(passphrase, confirmation) || busy) return;
    setBusy(true);
    try {
      setRecoveryKey(await onCreate(passphrase));
    } catch (error) {
      await alertError(error);
    } finally {
      setBusy(false);
    }
  }

  if (recoveryKey) {
    return (
      <main className="flow">
        <StepHeader label={text.setupLabel} current={2} total={2} />
        <header className="flow-header">
          <h1>{text.recoveryTitle}</h1>
          <p className="sub">
            {text.recoveryBody}
            <strong className="strong">{text.recoveryOnce}</strong>
          </p>
        </header>
        <RecoveryKeyPanel recoveryKey={recoveryKey} onCopy={onCopy} onSaveToFile={onSaveToFile} onDone={onDone} />
      </main>
    );
  }

  return (
    <form className="flow" onSubmit={(e) => void submit(e)}>
      <StepHeader label={text.setupLabel} current={1} total={2} />
      <header className="flow-header">
        <h1>{text.passphraseTitle}</h1>
        <p className="sub">{text.passphraseBody}</p>
      </header>

      <div className="field-stack">
        <PasswordField
          label={text.passphrase}
          value={passphrase}
          onChange={setPassphrase}
          autoComplete="new-password"
          describedBy="passphrase-rules"
          autoFocus
        />
        <PasswordField
          label={text.confirmPassphrase}
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
        />
        <PassphraseRules id="passphrase-rules" passphrase={passphrase} confirmation={confirmation} />
      </div>

      <p className="hint">{text.passphraseNote}</p>

      <footer className="flow-footer">
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void onSignOut()}>
          {t().common.logout}
        </button>
        <button
          type="submit"
          className="btn btn-primary btn-wide"
          disabled={!isPassphraseValid(passphrase, confirmation) || busy}
          aria-busy={busy}
        >
          {text.next}
        </button>
      </footer>
    </form>
  );
}
