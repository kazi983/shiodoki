/**
 * Per-device settings in userData/settings.json. Kept apart from the task data:
 * logout deletes the cached tasks but not the settings. Not synced through Firestore.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveLocale, type Locale } from "@shared/i18n";
import {
  BUFFER_OPTIONS,
  DEFAULT_BUFFER_MINUTES,
  DEFAULT_LEAVE_TIME,
  LEAVE_TIME_PRESETS,
  type LeaveDefaults,
} from "@shared/leave";

export const LANGUAGE_SETTINGS = ["system", "ja", "en"] as const;

export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

/** A missing or broken file means "system". */
export function loadLanguageSetting(file: string): LanguageSetting {
  const value = readSettings(file).language;
  return (LANGUAGE_SETTINGS as readonly unknown[]).includes(value) ? (value as LanguageSetting) : "system";
}

export function saveLanguageSetting(file: string, language: LanguageSetting): void {
  updateSettings(file, { language });
}

export const STORAGE_SETTINGS = ["local", "cloud"] as const;

/** Where tasks are kept: this PC only, or Firestore (encrypted). Null until the user chooses (welcome page). */
export type StorageSetting = (typeof STORAGE_SETTINGS)[number] | null;

export function loadStorageSetting(file: string): StorageSetting {
  const value = readSettings(file).storage;
  return (STORAGE_SETTINGS as readonly unknown[]).includes(value) ? (value as StorageSetting) : null;
}

export function saveStorageSetting(file: string, storage: StorageSetting): void {
  updateSettings(file, { storage });
}

/** Overlay tab position: px from the top of the work area. Missing or broken means default. */
export function loadOverlayOffset(file: string): number | null {
  const value = readSettings(file).overlayOffsetY;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function saveOverlayOffset(file: string, offsetY: number): void {
  updateSettings(file, { overlayOffsetY: offsetY });
}

/** Tray defaults for the picker's leave inputs. A missing or unknown value means the built-in default. */
export function loadLeaveDefaults(file: string): LeaveDefaults {
  const settings = readSettings(file);
  const time = settings.defaultLeaveTime;
  const buffer = settings.defaultBufferMinutes;
  return {
    leaveTime:
      time === null || LEAVE_TIME_PRESETS.includes(time as string) ? (time as string | null) : DEFAULT_LEAVE_TIME,
    bufferMinutes: (BUFFER_OPTIONS as readonly unknown[]).includes(buffer)
      ? (buffer as number)
      : DEFAULT_BUFFER_MINUTES,
  };
}

/** A null time ("None") is saved as null, so it differs from a missing value. */
export function saveLeaveDefaults(file: string, patch: Partial<LeaveDefaults>): void {
  updateSettings(file, {
    ...(patch.leaveTime !== undefined && { defaultLeaveTime: patch.leaveTime }),
    ...(patch.bufferMinutes !== undefined && { defaultBufferMinutes: patch.bufferMinutes }),
  });
}

function readSettings(file: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Read-modify-write so saving one setting keeps the others. */
function updateSettings(file: string, patch: Record<string, unknown>): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...readSettings(file), ...patch }, null, 2));
}

/** SHIODOKI_LOCALE (tests) > the in-app setting > the OS language. */
export function chooseLocale(setting: LanguageSetting, osLanguageTag: string, override?: string): Locale {
  if (override) return resolveLocale(override);
  if (setting !== "system") return setting;
  return resolveLocale(osLanguageTag);
}
