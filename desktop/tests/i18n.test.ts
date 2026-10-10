import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { en } from "@shared/i18n/en";
import { ja } from "@shared/i18n/ja";
import { resolveLocale, setLocale, t } from "@shared/i18n";

describe("resolveLocale", () => {
  test("Japanese tags pick Japanese, everything else falls back to English", () => {
    expect(resolveLocale("ja")).toBe("ja");
    expect(resolveLocale("ja-JP")).toBe("ja");
    expect(resolveLocale("JA_jp")).toBe("ja");
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale("fr")).toBe("en");
    expect(resolveLocale("")).toBe("en");
  });
});

describe("t", () => {
  afterEach(() => setLocale("ja"));

  test("follows setLocale", () => {
    expect(t().picker.title).toBe("今から何をやる？");
    setLocale("en");
    expect(t().picker.title).toBe("What's your focus now?");
  });
});

describe("English", () => {
  test("singular and plural", () => {
    expect(en.picker.resumeMeta("1h 5m", 1)).toBe("Total 1h 5m · 1 session");
    expect(en.picker.resumeMeta("1h 5m", 3)).toBe("Total 1h 5m · 3 sessions");
    expect(en.dialogs.migrateConfirm(1)).toBe("Copy 1 task on this PC to Firebase?");
  });

  test("dates read 'Oct 9'; Japanese keeps '10-09'", () => {
    const d = new Date(2026, 9, 9);
    expect(en.dates.short(d)).toBe("Oct 9");
    expect(en.dates.full(d)).toBe("Oct 9, 2026");
    expect(ja.dates.short(d)).toBe("10-09");
    expect(ja.dates.full(d)).toBe("2026-10-09");
  });

  test("markup stays in the position the sentence needs", () => {
    expect(en.picker.workUntil("<time>")).toEqual(["Wrap up at ", "<time>"]);
    expect(ja.picker.workUntil("<time>")).toEqual(["<time>", " に作業ストップ"]);
  });
});

describe("no hardcoded Japanese outside the dictionary", () => {
  test("src has no Japanese string outside src/shared/i18n", () => {
    const src = join(__dirname, "..", "src");
    const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
    const offenders: string[] = [];
    for (const entry of readdirSync(src, { recursive: true, encoding: "utf8" })) {
      const file = join(src, entry);
      if (!/\.tsx?$/.test(file) || file.includes(join("shared", "i18n"))) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          // Comments may quote the UI text; only code lines count.
          if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
          if (japanese.test(line)) offenders.push(`${relative(src, file)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
