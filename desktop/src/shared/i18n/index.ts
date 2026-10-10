/**
 * UI text for the current locale. The main process decides the locale; each process
 * (main, UI renderer) calls setLocale() once at startup, before building any text.
 */

import { en } from "./en";
import { ja, type Messages } from "./ja";

export type Locale = "ja" | "en";
export type { Messages };

const MESSAGES: Record<Locale, Messages> = { ja, en };

/** Names in their own language (autonyms), the same whichever UI language is shown. */
export const LANGUAGE_NAMES: Record<Locale, string> = { ja: "日本語", en: "English" };

let current: Locale = "ja";

/** Japanese for any Japanese language tag ("ja", "ja-JP"), English for everything else. */
export function resolveLocale(languageTag: string): Locale {
  return languageTag.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/** Messages of the current locale. */
export function t(): Messages {
  return MESSAGES[current];
}
