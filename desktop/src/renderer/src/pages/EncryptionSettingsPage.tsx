import { useEffect, useState, type FormEvent } from "react";
import { t } from "@shared/i18n";
import { isPassphraseValid, MIN_PASSPHRASE_LENGTH } from "@shared/passphrase";
import { alertError } from "../errors";
import { CheckIcon, LockIcon } from "../icons";
import { PassphraseRules, PasswordField, RecoveryKeyPanel, SegmentedTabs, type SecretKind } from "../encryptionParts";

export interface EncryptionSettingsPageProps {
  email: string;
  /**
   * Re-wrap the data key with a new passphrase after checking the current passphrase or the recovery key. Resolves to
   * false when that secret is wrong. Other PCs keep their unlocked key, so they are not affected.
   */
  onChangePassphrase: (kind: SecretKind, secret: string, newPassphrase: string) => Promise<boolean>;
  /** Wrap the data key with a new recovery key (the old one stops working) and resolve to it. */
  onCreateRecoveryKey: () => Promise<string>;
  onCopy: (recoveryKey: string) => Promise<void>;
  onSaveToFile: (recoveryKey: string) => Promise<void>;
  onOpenHowItWorks: () => void;
  onClose: () => void;
}

/** Tray "Encryption…": change the passphrase, create a new recovery key (plan Q13). */
export function EncryptionSettingsPage(props: EncryptionSettingsPageProps) {
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const text = t().encryption;

  useEffect(() => {
    document.title = t().encryption.settingsWindowTitle;
  }, []);

  async function createRecoveryKey() {
    if (!(await window.api.dialog.confirm(text.newRecoveryKey, text.newRecoveryKeyConfirm))) return;
    try {
      setNewRecoveryKey(await props.onCreateRecoveryKey());
    } catch (error) {
      await alertError(error);
    }
  }

  if (newRecoveryKey) {
    return (
      <main className="flow">
        <header className="flow-header">
          <h1>{text.recoveryTitle}</h1>
          <p className="sub">
            {text.recoveryBody}
            <strong className="strong">{text.recoveryOnce}</strong>
          </p>
        </header>
        <RecoveryKeyPanel
          recoveryKey={newRecoveryKey}
          onCopy={props.onCopy}
          onSaveToFile={props.onSaveToFile}
          onDone={() => setNewRecoveryKey(null)}
        />
      </main>
    );
  }

  return (
    <main className="flow flow-scroll scroll">
      <header className="flow-header">
        <h1>{text.settingsTitle}</h1>
        <p className="status-ok">
          <LockIcon />
          <span className="status-ok-text">{text.statusOn}</span>
          <span className="account">{props.email}</span>
        </p>
      </header>

      <ChangePassphraseSection onChangePassphrase={props.onChangePassphrase} />

      <section className="panel" aria-labelledby="new-recovery-key-title">
        <h2 id="new-recovery-key-title">{text.newRecoveryKey}</h2>
        <p>
          {text.newRecoveryKeyBody}
          <strong className="strong-danger">{text.newRecoveryKeyWarning}</strong>
        </p>
        <div className="panel-actions">
          <button type="button" className="btn btn-outline-danger" onClick={() => void createRecoveryKey()}>
            {text.newRecoveryKeyButton}
          </button>
        </div>
      </section>

      <footer className="flow-footer">
        <button type="button" className="link-button" onClick={props.onOpenHowItWorks}>
          {text.howItWorks}
        </button>
        <button type="button" className="btn btn-outline" onClick={props.onClose}>
          {text.close}
        </button>
      </footer>
    </main>
  );
}

function ChangePassphraseSection({ onChangePassphrase }: Pick<EncryptionSettingsPageProps, "onChangePassphrase">) {
  const [kind, setKind] = useState<SecretKind>("passphrase");
  const [secret, setSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [wrong, setWrong] = useState(false);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const text = t().encryption;
  const canSubmit = secret.length > 0 && isPassphraseValid(passphrase, confirmation) && !busy;

  function edit(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setWrong(false);
      setChanged(false);
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      if (await onChangePassphrase(kind, secret, passphrase)) {
        setSecret("");
        setPassphrase("");
        setConfirmation("");
        setChanged(true);
      } else {
        setWrong(true);
      }
    } catch (error) {
      await alertError(error);
    } finally {
      setBusy(false);
    }
  }

  const secretLabel = kind === "passphrase" ? text.currentPassphrase : text.recoveryKey;
  const secretError = wrong ? (kind === "passphrase" ? text.wrongCurrentPassphrase : text.wrongRecoveryKey) : null;

  return (
    <form className="panel" aria-labelledby="change-passphrase-title" onSubmit={(e) => void submit(e)}>
      <h2 id="change-passphrase-title">{text.changePassphrase}</h2>
      <div className="field-stack-tight">
        <SegmentedTabs
          label={text.verify}
          options={[
            { value: "passphrase", label: text.currentPassphrase },
            { value: "recoveryKey", label: text.recoveryKey },
          ]}
          value={kind}
          onChange={(next) => {
            setKind(next);
            setSecret("");
            setWrong(false);
          }}
        />
        <p className="hint">{text.verifyHint}</p>
      </div>
      <PasswordField
        key={kind}
        label={secretLabel}
        value={secret}
        onChange={edit(setSecret)}
        autoComplete={kind === "passphrase" ? "current-password" : "off"}
        error={secretError}
        compact
      />
      <div className="field-row">
        <PasswordField
          label={text.newPassphrase}
          value={passphrase}
          onChange={edit(setPassphrase)}
          autoComplete="new-password"
          describedBy="new-passphrase-hint"
          compact
        />
        <PasswordField
          label={text.confirmNewPassphrase}
          value={confirmation}
          onChange={edit(setConfirmation)}
          autoComplete="new-password"
          compact
        />
      </div>
      {passphrase.length > 0 && <PassphraseRules passphrase={passphrase} confirmation={confirmation} />}
      <div className="panel-actions panel-actions-split">
        <span id="new-passphrase-hint" className="hint">
          {text.newPassphraseHint(MIN_PASSPHRASE_LENGTH)}
        </span>
        <span role="status" className="status-inline">
          {changed && (
            <>
              <CheckIcon size={14} />
              {text.passphraseChanged}
            </>
          )}
        </span>
        <button type="submit" className="btn btn-primary" disabled={!canSubmit} aria-busy={busy}>
          {text.change}
        </button>
      </div>
    </form>
  );
}
