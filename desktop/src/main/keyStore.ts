import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { safeStorage } from "electron";
import type { KeyStore } from "./encryptionService";

/**
 * The unlocked data key in a file encrypted with the OS keystore (Windows DPAPI, macOS Keychain, Linux libsecret or
 * kwallet), so the passphrase is asked only once per PC (plan Q11). Only usable after app "ready".
 *
 * Linux without a keyring uses Chromium's "basic_text" backend (a fixed key), which barely hides the key. It is still
 * used: the threat is the Firebase owner reading the cloud, not someone on this PC, and local mode keeps everything in
 * plain text anyway (plan Q10). Without safeStorage at all the key stays in memory and the user unlocks at every start.
 */
export function safeKeyStore(file: string): KeyStore {
  const available = () => {
    if (safeStorage.isEncryptionAvailable()) return true;
    // basic_text reports "not available" until plain text encryption is allowed explicitly.
    if (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text") {
      safeStorage.setUsePlainTextEncryption(true);
      return safeStorage.isEncryptionAvailable();
    }
    return false;
  };

  return {
    load(uid) {
      if (!available()) return null;
      try {
        const saved = JSON.parse(safeStorage.decryptString(readFileSync(file))) as { uid?: unknown; key?: unknown };
        return saved.uid === uid && typeof saved.key === "string" ? Buffer.from(saved.key, "base64") : null;
      } catch {
        return null;
      }
    },
    save(uid, key) {
      if (!available()) {
        console.warn("safeStorage is not available: the data key is kept in memory only.");
        return;
      }
      writeFileSync(file, safeStorage.encryptString(JSON.stringify({ uid, key: key.toString("base64") })), {
        mode: 0o600,
      });
    },
    clear() {
      rmSync(file, { force: true });
    },
  };
}
