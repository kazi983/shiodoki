import { checkPassphrase, MIN_PASSPHRASE_LENGTH } from "@shared/passphrase";
import type { SecretKind } from "@shared/passphrase";
import { t } from "@shared/i18n";
import { KEYS_EXIST, type KeysData } from "@shared/sync";
import {
  decryptField,
  encryptField,
  generateDek,
  generateRecoveryKey,
  generateSalt,
  isEncrypted,
  passphraseKek,
  PBKDF2_ITERATIONS,
  recoveryKek,
  unwrapDek,
  wrapDek,
} from "./crypto";
import type { DataRequester } from "./firestoreTaskRepository";

/** Keeps the unlocked data key on this PC between starts (Electron safeStorage in keyStore.ts). */
export interface KeyStore {
  /** The key saved for this account, or null. */
  load(uid: string): Buffer | null;
  save(uid: string, key: Buffer): void;
  clear(): void;
}

/** Encrypts and decrypts the fields that leave the PC. Implemented by EncryptionService. */
export interface FieldCipher {
  /** True once the data key is held (restored, set up or unlocked). */
  readonly ready: boolean;
  encrypt(plain: string): string;
  /** A value that is not encrypted (written before encryption) is returned as it is. Throws when it cannot be read. */
  decrypt(value: string): string;
}

const KEYS_TIMEOUT_MS = 30_000;

/**
 * Owns the data key (DEK) of the signed-in account. The DEK never leaves the main process: the renderer only sends
 * secrets in and gets a recovery key back, and the data window only sees ciphertext (docs/e2ee/design.md).
 */
export class EncryptionService implements FieldCipher {
  private dek: Buffer | null = null;
  private uid: string | null = null;

  constructor(
    private readonly data: DataRequester,
    private readonly store: KeyStore,
    /** Lower in tests: 600,000 iterations take about half a second. */
    private readonly iterations = PBKDF2_ITERATIONS,
  ) {}

  get ready(): boolean {
    return this.dek !== null;
  }

  /** At start or after sign-in: use the key this PC kept for the account, if any. */
  restore(uid: string): boolean {
    this.uid = uid;
    this.dek = this.store.load(uid);
    return this.ready;
  }

  /** Whether the account already has keys (set up on another PC). Throws when offline and not cached. */
  async hasKeys(): Promise<boolean> {
    return (await this.getKeys()) !== null;
  }

  /** First cloud sign-in: create the data key, wrap it twice, and return the recovery key to show once. */
  async create(passphrase: string): Promise<string> {
    if (!checkPassphrase(passphrase, passphrase).longEnough)
      throw new Error(t().encryption.passphraseTooShort(MIN_PASSPHRASE_LENGTH));
    const dek = generateDek();
    const recoveryKey = generateRecoveryKey();
    const keys: KeysData = {
      v: 1,
      passphrase: await this.wrapWithPassphrase(dek, passphrase),
      recovery: this.wrapWithRecoveryKey(dek, recoveryKey),
    };
    try {
      await this.data.request({ op: "createKeys", keys }, KEYS_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof Error && error.message.includes(KEYS_EXIST))
        throw new Error(t().encryption.keysExist, { cause: error });
      throw error;
    }
    this.keep(dek);
    return recoveryKey;
  }

  /** Another PC: unwrap the data key with the passphrase or the recovery key. False when the secret is wrong. */
  async unlock(kind: SecretKind, secret: string): Promise<boolean> {
    const keys = await this.requireKeys();
    const dek = await this.unwrap(keys, kind, secret);
    if (!dek) return false;
    this.keep(dek);
    return true;
  }

  /** Re-wrap the data key with a new passphrase; no task is re-encrypted, other PCs keep working. */
  async changePassphrase(kind: SecretKind, secret: string, newPassphrase: string): Promise<boolean> {
    if (!checkPassphrase(newPassphrase, newPassphrase).longEnough)
      throw new Error(t().encryption.passphraseTooShort(MIN_PASSPHRASE_LENGTH));
    const keys = await this.requireKeys();
    const dek = await this.unwrap(keys, kind, secret);
    if (!dek) return false;
    await this.data.request(
      { op: "updateKeys", patch: { passphrase: await this.wrapWithPassphrase(dek, newPassphrase) } },
      KEYS_TIMEOUT_MS,
    );
    return true;
  }

  /** Wrap the data key with a new recovery key; the old one stops working. */
  async createRecoveryKey(): Promise<string> {
    const dek = this.requireDek();
    const recoveryKey = generateRecoveryKey();
    await this.data.request(
      { op: "updateKeys", patch: { recovery: this.wrapWithRecoveryKey(dek, recoveryKey) } },
      KEYS_TIMEOUT_MS,
    );
    return recoveryKey;
  }

  /** Sign-out: remove the key from memory and from this PC. */
  forget(): void {
    this.dek = null;
    this.uid = null;
    this.store.clear();
  }

  encrypt(plain: string): string {
    return encryptField(this.requireDek(), plain);
  }

  decrypt(value: string): string {
    // Data written before encryption (plan Q8: Kazi's data is rebuilt, but be lenient).
    if (!isEncrypted(value)) return value;
    return decryptField(this.requireDek(), value);
  }

  private async getKeys(): Promise<KeysData | null> {
    return this.data.request<KeysData | null>({ op: "getKeys" }, KEYS_TIMEOUT_MS);
  }

  private async requireKeys(): Promise<KeysData> {
    const keys = await this.getKeys();
    if (!keys) throw new Error("This account has no encryption keys");
    return keys;
  }

  private async unwrap(keys: KeysData, kind: SecretKind, secret: string): Promise<Buffer | null> {
    if (kind === "passphrase") {
      const { salt, iterations, wrappedKey } = keys.passphrase;
      return unwrapDek(await passphraseKek(secret, Buffer.from(salt, "base64"), iterations), wrappedKey);
    }
    const kek = recoveryKek(secret, Buffer.from(keys.recovery.salt, "base64"));
    return kek ? unwrapDek(kek, keys.recovery.wrappedKey) : null;
  }

  private async wrapWithPassphrase(dek: Buffer, passphrase: string): Promise<KeysData["passphrase"]> {
    const salt = generateSalt();
    const kek = await passphraseKek(passphrase, salt, this.iterations);
    return {
      kdf: "PBKDF2-SHA256",
      iterations: this.iterations,
      salt: salt.toString("base64"),
      wrappedKey: wrapDek(kek, dek),
    };
  }

  private wrapWithRecoveryKey(dek: Buffer, recoveryKey: string): KeysData["recovery"] {
    const salt = generateSalt();
    return {
      kdf: "HKDF-SHA256",
      salt: salt.toString("base64"),
      wrappedKey: wrapDek(recoveryKek(recoveryKey, salt)!, dek),
    };
  }

  private keep(dek: Buffer): void {
    this.dek = dek;
    if (this.uid) this.store.save(this.uid, dek);
  }

  private requireDek(): Buffer {
    if (!this.dek) throw new Error("The data is locked");
    return this.dek;
  }
}
