/**
 * Passphrase rules shared by the renderer (live checks) and the main process (final check).
 * NIST SP 800-63B style: a minimum length only, no composition rules (plan Q12).
 */

export const MIN_PASSPHRASE_LENGTH = 10;

/** How the user proves who they are: the passphrase or the recovery key. */
export type SecretKind = "passphrase" | "recoveryKey";

export interface PassphraseChecks {
  longEnough: boolean;
  matches: boolean;
}

/** Length counts characters (code points), so an emoji or a kanji counts as one. */
export function checkPassphrase(passphrase: string, confirmation: string): PassphraseChecks {
  return {
    longEnough: [...passphrase].length >= MIN_PASSPHRASE_LENGTH,
    matches: passphrase.length > 0 && passphrase === confirmation,
  };
}

export function isPassphraseValid(passphrase: string, confirmation: string): boolean {
  const checks = checkPassphrase(passphrase, confirmation);
  return checks.longEnough && checks.matches;
}

/** Groups of a recovery key for display ("K7QM-2XRT-…" → ["K7QM", "2XRT", …]). */
export function recoveryKeyGroups(recoveryKey: string): string[] {
  return recoveryKey.split("-").filter((group) => group.length > 0);
}
