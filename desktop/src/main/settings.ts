/**
 * Per-device settings in userData/settings.json. Kept apart from the task data:
 * logout deletes the cached tasks but not the settings. Not synced through Firestore.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveLocale, type Locale } from "@shared/i18n";

export const LANGUAGE_SETTINGS = ["system", "ja", "en"] as const;

export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

/** A missing or broken file means "system". */
export function loadLanguageSetting(file: string): LanguageSetting {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8")).language;
    return (LANGUAGE_SETTINGS as readonly unknown[]).includes(value) ? (value as LanguageSetting) : "system";
  } catch {
    return "system";
  }
}

export function saveLanguageSetting(file: string, language: LanguageSetting): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ language }, null, 2));
}

/** SHIODOKI_LOCALE (tests) > the in-app setting > the OS language. */
export function chooseLocale(setting: LanguageSetting, osLanguageTag: string, override?: string): Locale {
  if (override) return resolveLocale(override);
  if (setting !== "system") return setting;
  return resolveLocale(osLanguageTag);
}
