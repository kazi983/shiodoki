/**
 * UI text for the current locale. The main process decides the locale; each process
 * (main, UI renderer) calls setLocale() once at startup, before building any text.
 */

import { ja, type Messages } from "./ja";

export type Locale = "ja";
export type { Messages };

const MESSAGES: Record<Locale, Messages> = { ja };

let current: Locale = "ja";

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
