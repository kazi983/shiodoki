/**
 * TODO(backend): temporary props for the local mode and encryption pages, so they render before the main process
 * supports them. Replace each function with a window.api call (see the implementation guide), then delete this file.
 *
 * Fake secrets for trying the pages: passphrase "correct-passphrase", recovery key "K7QM-2XRT-P9DW-H4NA-VC3E-J8LZ-R6FY-T2GB".
 */

import type { EncryptionSettingsPageProps } from "./pages/EncryptionSettingsPage";
import type { EncryptionSetupPageProps } from "./pages/EncryptionSetupPage";
import type { UnlockPageProps } from "./pages/UnlockPage";
import type { WelcomePageProps } from "./pages/WelcomePage";

const FAKE_PASSPHRASE = "correct-passphrase";
const FAKE_RECOVERY_KEY = "K7QM-2XRT-P9DW-H4NA-VC3E-J8LZ-R6FY-T2GB";
const FAKE_EMAIL = "you@gmail.com";

/** Simulates the time the key derivation (PBKDF2, 600,000 iterations) takes. */
const slow = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 600));

function log(name: string): void {
  console.warn(`TODO(backend): ${name}`);
}

const copy = async (recoveryKey: string) => navigator.clipboard.writeText(recoveryKey);
const saveToFile = async () => log("save the recovery key to a file");

export const welcomePlaceholder: WelcomePageProps = {
  onUseLocal: async () => log("use local mode"),
  onSignIn: async () => log("sign in with Google"),
  onOpenPrivacy: () => log("open the privacy page"),
};

export const encryptionSetupPlaceholder: EncryptionSetupPageProps = {
  onCreate: () => slow(FAKE_RECOVERY_KEY),
  onCopy: copy,
  onSaveToFile: saveToFile,
  onDone: () => log("finish the encryption setup"),
  onSignOut: async () => log("sign out"),
};

export const unlockPlaceholder: UnlockPageProps = {
  email: FAKE_EMAIL,
  onUnlock: (kind, secret) => slow(secret === (kind === "passphrase" ? FAKE_PASSPHRASE : FAKE_RECOVERY_KEY)),
  onSignOut: async () => log("sign out"),
};

export const encryptionSettingsPlaceholder: EncryptionSettingsPageProps = {
  email: FAKE_EMAIL,
  onChangePassphrase: (kind, secret) => slow(secret === (kind === "passphrase" ? FAKE_PASSPHRASE : FAKE_RECOVERY_KEY)),
  onCreateRecoveryKey: () => slow(FAKE_RECOVERY_KEY),
  onCopy: copy,
  onSaveToFile: saveToFile,
  onOpenHowItWorks: () => log("open how encryption works"),
  onClose: () => window.close(),
};
