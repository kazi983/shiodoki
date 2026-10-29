import { describe, expect, test } from "vitest";
import {
  decryptField,
  encryptField,
  generateDek,
  generateRecoveryKey,
  generateSalt,
  isEncrypted,
  normalizeRecoveryKey,
  passphraseKek,
  recoveryKek,
  unwrapDek,
  wrapDek,
} from "../src/main/crypto";

describe("field encryption", () => {
  test("round trip, including Japanese and emoji", () => {
    const dek = generateDek();
    for (const text of ["", "Write requirements", "要件を書く 🌊", "a".repeat(5000)]) {
      const value = encryptField(dek, text);
      expect(isEncrypted(value)).toBe(true);
      expect(decryptField(dek, value)).toBe(text);
    }
  });

  test("the layout is e1: + base64(iv 12 ‖ ciphertext ‖ tag 16)", () => {
    const value = encryptField(generateDek(), "abc");
    const bytes = Buffer.from(value.slice(3), "base64");
    expect(value.startsWith("e1:")).toBe(true);
    expect(bytes.length).toBe(12 + 3 + 16);
  });

  test("the same text encrypts differently every time (fresh IV)", () => {
    const dek = generateDek();
    expect(encryptField(dek, "same")).not.toBe(encryptField(dek, "same"));
  });

  test("a changed byte or the wrong key fails", () => {
    const dek = generateDek();
    const bytes = Buffer.from(encryptField(dek, "secret").slice(3), "base64");
    bytes[14] ^= 1;
    expect(() => decryptField(dek, "e1:" + bytes.toString("base64"))).toThrow();
    expect(() => decryptField(generateDek(), encryptField(dek, "secret"))).toThrow();
    expect(() => decryptField(dek, "plain text")).toThrow();
  });
});

describe("key wrapping", () => {
  test("the right KEK unwraps, the wrong one returns null", async () => {
    const dek = generateDek();
    const salt = generateSalt();
    const wrapped = wrapDek(await passphraseKek("kaze-no-tayori", salt, 1000), dek);
    expect(unwrapDek(await passphraseKek("kaze-no-tayori", salt, 1000), wrapped)).toEqual(dek);
    expect(unwrapDek(await passphraseKek("kaze-no-tayorI", salt, 1000), wrapped)).toBeNull();
    expect(unwrapDek(await passphraseKek("kaze-no-tayori", generateSalt(), 1000), wrapped)).toBeNull();
    expect(unwrapDek(await passphraseKek("kaze-no-tayori", salt, 1000), "e1:broken")).toBeNull();
  });

  test("passphraseKek is PBKDF2-SHA256 (RFC 7914 vector)", async () => {
    const kek = await passphraseKek("passwd", Buffer.from("salt"), 1);
    expect(kek.toString("hex")).toBe("55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc");
  });

  test("the passphrase is NFC-normalized (composed and decomposed kana give the same key)", async () => {
    const salt = generateSalt();
    const composed = "がっこうのパスフレーズ";
    const decomposed = composed.normalize("NFD");
    expect(decomposed).not.toBe(composed);
    expect(await passphraseKek(decomposed, salt, 1000)).toEqual(await passphraseKek(composed, salt, 1000));
  });
});

describe("recovery key", () => {
  test("8 groups of 4 Crockford base32 characters", () => {
    const key = generateRecoveryKey();
    expect(key).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){7}$/);
    expect(generateRecoveryKey()).not.toBe(key);
  });

  test("typed in lower case, without dashes or with O / I / L still gives the same KEK", () => {
    const salt = generateSalt();
    const key = "K7QM-2XRT-P9DW-H4NA-VC3E-J8KZ-R6FY-T2GB";
    const kek = recoveryKek(key, salt);
    expect(kek).not.toBeNull();
    expect(recoveryKek(key.toLowerCase().replace(/-/g, ""), salt)).toEqual(kek);
    expect(recoveryKek(` ${key.replace(/-/g, " ")} `, salt)).toEqual(kek);

    const withZeroAndOne = "10QM-2XRT-P9DW-H4NA-VC3E-J8KZ-R6FY-T2GB";
    expect(recoveryKek("LOQM-2XRT-P9DW-H4NA-VC3E-J8KZ-R6FY-T2GB", salt)).toEqual(recoveryKek(withZeroAndOne, salt));
    expect(normalizeRecoveryKey("io-l")).toBe("101");
  });

  test("a key of the wrong length or with U is not a key", () => {
    const salt = generateSalt();
    expect(recoveryKek("K7QM-2XRT", salt)).toBeNull();
    expect(recoveryKek("U7QM-2XRT-P9DW-H4NA-VC3E-J8KZ-R6FY-T2GB", salt)).toBeNull();
  });

  test("a generated key wraps and unwraps the DEK", () => {
    const dek = generateDek();
    const salt = generateSalt();
    const key = generateRecoveryKey();
    const wrapped = wrapDek(recoveryKek(key, salt)!, dek);
    expect(unwrapDek(recoveryKek(key.toLowerCase(), salt)!, wrapped)).toEqual(dek);
    expect(unwrapDek(recoveryKek(generateRecoveryKey(), salt)!, wrapped)).toBeNull();
  });
});
