/**
 * Runtime configuration. TASK_MODE=test shrinks the intervals
 * (30min -> 5s, snooze 5min -> 10s) and uses a separate data file.
 */

export const TEST_MODE = process.env.TASK_MODE === "test";

export const INTERVAL_MS = TEST_MODE ? 5_000 : 30 * 60_000;
export const SNOOZE_MS = TEST_MODE ? 10_000 : 5 * 60_000;

export const APP_DIR_NAME = "30min-task-timer-v2";
export const STORE_FILE_NAME = TEST_MODE ? "store_test.json" : "store.json";
