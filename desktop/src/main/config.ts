/**
 * Runtime configuration. TASK_MODE=test shrinks the intervals
 * (30min -> 5s, snooze 5min -> 10s) and uses a separate data file.
 */

export const TEST_MODE = process.env.TASK_MODE === "test";

export const INTERVAL_MS = TEST_MODE ? 5_000 : 30 * 60_000;
export const SNOOZE_MS = TEST_MODE ? 10_000 : 5 * 60_000;

/** Local data directory name (under %APPDATA% / ~/.config). */
export const APP_DIR_NAME = "shiodoki";
export const STORE_FILE_NAME = TEST_MODE ? "store_test.json" : "store.json";
/** The unlocked data key of the signed-in account, encrypted with the OS keystore (keyStore.ts). */
export const DEK_FILE_NAME = "dek.bin";
