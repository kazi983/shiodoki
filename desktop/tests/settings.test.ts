import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { chooseLocale, loadLanguageSetting, saveLanguageSetting } from "../src/main/settings";

describe("language setting file", () => {
  const dir = mkdtempSync(join(tmpdir(), "shiodoki-settings-"));
  const file = join(dir, "nested", "settings.json");

  afterEach(() => rmSync(join(dir, "nested"), { recursive: true, force: true }));

  test("missing file means system", () => {
    expect(loadLanguageSetting(file)).toBe("system");
  });

  test("saves and loads", () => {
    saveLanguageSetting(file, "en");
    expect(loadLanguageSetting(file)).toBe("en");
    saveLanguageSetting(file, "system");
    expect(loadLanguageSetting(file)).toBe("system");
  });

  test("broken file or unknown value means system", () => {
    saveLanguageSetting(file, "ja");
    writeFileSync(file, "{not json");
    expect(loadLanguageSetting(file)).toBe("system");
    writeFileSync(file, JSON.stringify({ language: "fr" }));
    expect(loadLanguageSetting(file)).toBe("system");
  });
});

describe("chooseLocale", () => {
  test("system follows the OS language, English for non-Japanese", () => {
    expect(chooseLocale("system", "ja-JP")).toBe("ja");
    expect(chooseLocale("system", "de-DE")).toBe("en");
  });

  test("the setting wins over the OS language", () => {
    expect(chooseLocale("en", "ja-JP")).toBe("en");
    expect(chooseLocale("ja", "en-US")).toBe("ja");
  });

  test("SHIODOKI_LOCALE wins over everything", () => {
    expect(chooseLocale("en", "en-US", "ja")).toBe("ja");
    expect(chooseLocale("system", "ja-JP", "en")).toBe("en");
  });
});
