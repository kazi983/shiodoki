/**
 * End-to-end encryption primitives (docs/e2ee/design.md). Node only, no Electron, so Vitest can run it.
 *
 * Envelope encryption: one random data key (DEK) per account encrypts the task names, memos and session task names.
 * The DEK itself is stored in Firestore only "wrapped" (encrypted) by two key encryption keys (KEK): one derived from
 * the passphrase, one from the recovery key. Either secret unwraps the DEK.
 */

import { createCipheriv, createDecipheriv, hkdfSync, pbkdf2, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

/** Version prefix of every encrypted value. */
export const CIPHER_PREFIX = "e1:";
export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const RECOVERY_KEY_BYTES = 20;
const RECOVERY_INFO = "shiodoki recovery v1";
/** Crockford base32: no I, L, O, U, so the key is easy to read and type. */
const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateDek(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function generateSalt(): Buffer {
  return randomBytes(SALT_BYTES);
}

/** AES-256-GCM with a fresh IV: "e1:" + base64(iv ‖ ciphertext ‖ tag), the layout Web Crypto and Android use. */
function seal(key: Buffer, plain: Buffer): string {
  // Never reuse an IV with the same key: always a new random one.
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return CIPHER_PREFIX + Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
}

/** Throws when the value is not "e1:", was changed, or the key is wrong (GCM tag check). */
function open(key: Buffer, value: string): Buffer {
  if (!isEncrypted(value)) throw new Error("Not an encrypted value");
  const bytes = Buffer.from(value.slice(CIPHER_PREFIX.length), "base64");
  if (bytes.length < IV_BYTES + TAG_BYTES) throw new Error("Encrypted value is too short");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, IV_BYTES));
  decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
  return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES)), decipher.final()]);
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(CIPHER_PREFIX);
}

export function encryptField(dek: Buffer, plain: string): string {
  return seal(dek, Buffer.from(plain, "utf8"));
}

export function decryptField(dek: Buffer, value: string): string {
  return open(dek, value).toString("utf8");
}

/**
 * PBKDF2-SHA256 (slow on purpose, ~0.5 s at 600,000 iterations; async so the UI does not freeze).
 * NFC first: the same passphrase typed on another OS or keyboard gives the same key.
 */
export async function passphraseKek(passphrase: string, salt: Buffer, iterations: number): Promise<Buffer> {
  return pbkdf2Async(passphrase.normalize("NFC"), salt, iterations, KEY_BYTES, "sha256");
}

/** The recovery key is already 160 random bits, so HKDF is enough (no slow KDF). Null when it is not a valid key. */
export function recoveryKek(recoveryKey: string, salt: Buffer): Buffer | null {
  const bytes = decodeRecoveryKey(recoveryKey);
  if (!bytes) return null;
  return Buffer.from(hkdfSync("sha256", bytes, salt, RECOVERY_INFO, KEY_BYTES));
}

/** 20 random bytes as 32 base32 characters in 8 groups of 4 ("K7QM-2XRT-…"). */
export function generateRecoveryKey(): string {
  const text = encodeBase32(randomBytes(RECOVERY_KEY_BYTES));
  return text.match(/.{4}/g)!.join("-");
}

/** Accepts any case, with or without dashes and spaces; O is read as 0 and I / L as 1. */
export function normalizeRecoveryKey(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

function decodeRecoveryKey(input: string): Buffer | null {
  const text = normalizeRecoveryKey(input);
  if (text.length !== (RECOVERY_KEY_BYTES * 8) / 5) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    const index = BASE32.indexOf(char);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32[(value >> bits) & 31];
    }
  }
  return out;
}

export function wrapDek(kek: Buffer, dek: Buffer): string {
  return seal(kek, dek);
}

/** Null when the KEK is wrong (the secret did not match) or the value is broken. */
export function unwrapDek(kek: Buffer, wrapped: string): Buffer | null {
  try {
    const dek = open(kek, wrapped);
    return dek.length === KEY_BYTES ? dek : null;
  } catch {
    return null;
  }
}
