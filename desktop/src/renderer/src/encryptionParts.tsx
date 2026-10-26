/** Building blocks shared by the encryption pages (setup, unlock, settings). */

import { useId, useState } from "react";
import { t } from "@shared/i18n";
import { checkPassphrase, MIN_PASSPHRASE_LENGTH, recoveryKeyGroups } from "@shared/passphrase";
import { CheckIcon, CopyIcon, DownloadIcon, ErrorIcon, EyeIcon, WarningIcon } from "./icons";

/** How the user proves who they are: the passphrase or the recovery key. */
export type SecretKind = "passphrase" | "recoveryKey";

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  error,
  describedBy,
  autoFocus,
  compact,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password" | "off";
  /** Shown under the field and announced. */
  error?: string | null;
  /** Id of a hint elsewhere on the page. */
  describedBy?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = useId();
  const text = t().encryption;
  const describedByIds = [error ? errorId : null, describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <div className="secret-field">
      <label className="secret-label">
        {label}
        <span className={`secret-box${error ? " invalid" : ""}${compact ? " compact" : ""}`}>
          <input
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedByIds}
            autoFocus={autoFocus}
          />
          <button
            type="button"
            className="secret-toggle"
            aria-label={visible ? text.hide(label) : text.show(label)}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            <EyeIcon off={visible} />
          </button>
        </span>
      </label>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          <ErrorIcon />
          {error}
        </p>
      )}
    </div>
  );
}

/** Two-way switch (passphrase / recovery key) drawn as tabs. */
export function SegmentedTabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? "active" : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Live checks under a new passphrase: length and confirmation. */
export function PassphraseRules({
  id,
  passphrase,
  confirmation,
}: {
  id?: string;
  passphrase: string;
  confirmation: string;
}) {
  const text = t().encryption;
  const checks = checkPassphrase(passphrase, confirmation);
  const rules = [
    { ok: checks.longEnough, label: text.ruleLength(MIN_PASSPHRASE_LENGTH) },
    { ok: checks.matches, label: text.ruleMatch },
  ];
  return (
    <ul id={id} className="passphrase-rules">
      {rules.map((rule) => (
        <li key={rule.label} className={rule.ok ? "ok" : undefined}>
          {rule.ok ? <CheckIcon size={14} /> : <span className="rule-dot" aria-hidden />}
          {rule.label}
        </li>
      ))}
    </ul>
  );
}

/** Step label and progress bar of a multi-step flow. */
export function StepHeader({ label, current, total }: { label: string; current: number; total: number }) {
  return (
    <div className="step-header">
      <div className="step-text">
        <span>{label}</span>
        <span>{t().encryption.step(current, total)}</span>
      </div>
      <div className="step-bar" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < current ? "done" : undefined} />
        ))}
      </div>
    </div>
  );
}

/**
 * The recovery key, shown once: copy, save as a file, then confirm it was saved. Used by the first setup and by
 * "new recovery key" in the encryption window.
 */
export function RecoveryKeyPanel({
  recoveryKey,
  onCopy,
  onSaveToFile,
  onDone,
}: {
  recoveryKey: string;
  onCopy: (recoveryKey: string) => Promise<void>;
  onSaveToFile: (recoveryKey: string) => Promise<void>;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = t().encryption;

  async function copy() {
    await onCopy(recoveryKey);
    setCopied(true);
  }

  return (
    <>
      <section className="recovery-key" aria-label={text.recoveryKey}>
        <div className="recovery-groups mono">
          {recoveryKeyGroups(recoveryKey).map((group, i) => (
            <span key={i}>{group}</span>
          ))}
        </div>
        <div className="recovery-actions">
          <button type="button" className="btn btn-outline" onClick={() => void copy()}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? text.copied : text.copy}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => void onSaveToFile(recoveryKey)}>
            <DownloadIcon />
            {text.saveToFile}
          </button>
        </div>
      </section>

      <p className="notice notice-warn">
        <WarningIcon />
        <span>{text.recoveryWarning}</span>
      </p>

      <footer className="flow-footer">
        <label className="check-label">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          {text.savedCheck}
        </label>
        <button type="button" className="btn btn-primary btn-wide" disabled={!saved} onClick={onDone}>
          {text.done}
        </button>
      </footer>
    </>
  );
}
