import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { powerMonitor } from "electron";
import { parseScreenSaverLine, ScreenState, type ScreenStateCallbacks } from "./screenState";

/**
 * Watches suspend / resume and screen lock. Electron reports the lock only on
 * Windows and macOS, so on Linux the GNOME screen saver signal is read through
 * `gdbus monitor` (the same signal desktop/linux/shiodoki-relaunch.sh waits for).
 * Returns a function that stops watching.
 */
export function watchScreenState(callbacks: ScreenStateCallbacks): () => void {
  const state = new ScreenState(callbacks);
  const onSuspend = () => state.setSuspended(true);
  const onResume = () => state.setSuspended(false);
  powerMonitor.on("suspend", onSuspend);
  powerMonitor.on("resume", onResume);

  let stopLockWatch: () => void;
  if (process.platform === "linux") {
    stopLockWatch = watchGnomeScreenSaver((active) => state.setLocked(active));
  } else {
    const onLock = () => state.setLocked(true);
    const onUnlock = () => state.setLocked(false);
    powerMonitor.on("lock-screen", onLock);
    powerMonitor.on("unlock-screen", onUnlock);
    stopLockWatch = () => {
      powerMonitor.off("lock-screen", onLock);
      powerMonitor.off("unlock-screen", onUnlock);
    };
  }

  return () => {
    powerMonitor.off("suspend", onSuspend);
    powerMonitor.off("resume", onResume);
    stopLockWatch();
  };
}

function watchGnomeScreenSaver(onActiveChanged: (active: boolean) => void): () => void {
  const child = spawn(
    "gdbus",
    ["monitor", "--session", "--dest", "org.gnome.ScreenSaver", "--object-path", "/org/gnome/ScreenSaver"],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  // Not GNOME, no session bus or no gdbus: only suspend ends the session.
  child.on("error", (error) => console.warn("Screen lock is not watched:", error.message));
  child.on("exit", (code, signal) => {
    if (signal !== "SIGTERM") console.warn(`Screen lock watch ended (code ${code})`);
  });
  createInterface({ input: child.stdout }).on("line", (line) => {
    const active = parseScreenSaverLine(line);
    if (active !== null) onActiveChanged(active);
  });
  return () => child.kill("SIGTERM");
}
