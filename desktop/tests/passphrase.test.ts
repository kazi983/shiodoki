import { describe, expect, test } from "vitest";
import { checkPassphrase, isPassphraseValid, recoveryKeyGroups } from "@shared/passphrase";

describe("checkPassphrase", () => {
  test("needs at least 10 characters, counted as code points", () => {
    expect(checkPassphrase("123456789", "").longEnough).toBe(false);
    expect(checkPassphrase("1234567890", "").longEnough).toBe(true);
    // 5 kanji + 5 emoji: 10 characters, although the emoji are 2 UTF-16 units each.
    expect(checkPassphrase("潮時のアプ🌊🌊🌊🌊🌊", "").longEnough).toBe(true);
    expect(checkPassphrase("潮時🌊🌊🌊", "").longEnough).toBe(false);
  });

  test("the confirmation must match and an empty pair does not count", () => {
    expect(checkPassphrase("kaze-no-tayori", "kaze-no-tayori").matches).toBe(true);
    expect(checkPassphrase("kaze-no-tayori", "kaze-no-tayor").matches).toBe(false);
    expect(checkPassphrase("", "").matches).toBe(false);
  });

  test("isPassphraseValid needs both", () => {
    expect(isPassphraseValid("kaze-no-tayori", "kaze-no-tayori")).toBe(true);
    expect(isPassphraseValid("short", "short")).toBe(false);
    expect(isPassphraseValid("kaze-no-tayori", "other")).toBe(false);
  });
});

describe("recoveryKeyGroups", () => {
  test("splits at the dashes and ignores empty groups", () => {
    expect(recoveryKeyGroups("K7QM-2XRT-P9DW")).toEqual(["K7QM", "2XRT", "P9DW"]);
    expect(recoveryKeyGroups("K7QM--2XRT-")).toEqual(["K7QM", "2XRT"]);
  });
});
