/**
 * Detects a UTC offset that differs from the OS. Electron bundles its own time zone data (ICU), so a
 * rule change the OS already knows (British Columbia keeping UTC-7 from November 2026, for example)
 * shifts every time the app shows and every leave time it computes until Electron is updated.
 */

import { execFile } from "node:child_process";

/** Minutes east of UTC from `date +%z` output ("+0900", "-0700"); null when it cannot be read. */
export function parseUtcOffset(text: string): number | null {
  const match = /^([+-])(\d{2})(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/** The app's offset minus the OS offset, in minutes; 0 when they agree. */
export function clockSkewMinutes(now: Date, osOffsetMinutes: number): number {
  return -now.getTimezoneOffset() - osOffsetMinutes;
}

/** The OS offset now, from `date +%z` (Linux, macOS). Null on Windows or when `date` fails. */
export function readOsUtcOffset(): Promise<number | null> {
  if (process.platform === "win32") return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile("date", ["+%z"], { timeout: 5000 }, (error, stdout) => resolve(error ? null : parseUtcOffset(stdout)));
  });
}

/** Compares the app with the OS; returns the skew in minutes (0 when equal or unknown). */
export async function checkClockSkew(now: () => Date = () => new Date()): Promise<number> {
  const os = await readOsUtcOffset();
  if (os === null) return 0;
  const skew = clockSkewMinutes(now(), os);
  if (skew !== 0) {
    console.warn(
      `The app's UTC offset differs from the OS by ${skew} min (app ${-now().getTimezoneOffset()}, OS ${os}). ` +
        `Electron's time zone data (${process.versions.tz ?? "unknown"}) is probably out of date.`,
    );
  }
  return skew;
}
