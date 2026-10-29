import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import { setLocale } from "../src/shared/i18n";
import { startUpdateCheck, type UpdatePromptDeps } from "../src/main/updater";

// Button indexes: available = [update, whatsNew, later], downloaded = [restartNow, onQuit]
class FakeUpdater extends EventEmitter {
  autoDownload = true;
  checkForUpdates = vi.fn(async () => {});
  downloadUpdate = vi.fn(async () => {});
}

let updater: FakeUpdater;
let answers: number[];
let deps: {
  [K in "ask" | "showError" | "openReleasePage" | "restartToInstall"]: Mock<UpdatePromptDeps[K]>;
} & UpdatePromptDeps;

beforeEach(() => {
  setLocale("en");
  updater = new FakeUpdater();
  answers = [];
  deps = {
    updater,
    currentVersion: "2.0.0-alpha.3",
    ask: vi.fn<UpdatePromptDeps["ask"]>(async () => answers.shift() ?? -1),
    showError: vi.fn<UpdatePromptDeps["showError"]>(),
    openReleasePage: vi.fn<UpdatePromptDeps["openReleasePage"]>(),
    restartToInstall: vi.fn<UpdatePromptDeps["restartToInstall"]>(),
  };
  startUpdateCheck(deps);
});

/** Lets the awaited dialogs resolve. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("startUpdateCheck", () => {
  test("checks once and never downloads by itself", () => {
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    expect(updater.autoDownload).toBe(false);
  });

  test("downloads only after the user agrees, then restarts on request", async () => {
    answers = [0];
    updater.emit("update-available", { version: "2.0.0-alpha.4" });
    await settle();
    expect(deps.ask.mock.calls[0][0].message).toContain("2.0.0-alpha.4");
    expect(deps.ask.mock.calls[0][0].message).toContain("2.0.0-alpha.3");
    expect(updater.downloadUpdate).toHaveBeenCalledOnce();

    answers = [0];
    updater.emit("update-downloaded", { version: "2.0.0-alpha.4" });
    await settle();
    expect(deps.restartToInstall).toHaveBeenCalledOnce();
  });

  test("later skips the download", async () => {
    answers = [2];
    updater.emit("update-available", { version: "2.0.0-alpha.4" });
    await settle();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  test("see what's new opens the release page and asks again", async () => {
    answers = [1, 0];
    updater.emit("update-available", { version: "2.0.0-alpha.4" });
    await settle();
    expect(deps.openReleasePage).toHaveBeenCalledWith("2.0.0-alpha.4");
    expect(deps.ask).toHaveBeenCalledTimes(2);
    expect(updater.downloadUpdate).toHaveBeenCalledOnce();
  });

  test("update when I quit does not restart", async () => {
    answers = [1];
    updater.emit("update-downloaded", { version: "2.0.0-alpha.4" });
    await settle();
    expect(deps.restartToInstall).not.toHaveBeenCalled();
  });

  test("a failed check is only logged; a failed download is shown", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    updater.emit("error", new Error("offline"));
    expect(deps.showError).not.toHaveBeenCalled();

    answers = [0];
    updater.emit("update-available", { version: "2.0.0-alpha.4" });
    await settle();
    updater.emit("error", new Error("404"));
    expect(deps.showError).toHaveBeenCalledWith(expect.stringContaining("404"));
  });
});
