import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LeaveScheduleService } from "../src/main/leaveScheduleService";
import { SessionService } from "../src/main/sessionService";
import { JsonFileTaskRepository } from "../src/main/taskRepository";
import { TaskService } from "../src/main/taskService";
import { TimerService } from "../src/main/timerService";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "timer-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe("TimerService", () => {
  test("runs, cancels and cancels all", () => {
    vi.useFakeTimers();
    const timer = new TimerService();
    const a = vi.fn();
    const b = vi.fn();
    const id = timer.start(1000, a);
    timer.start(2000, b);
    timer.cancel(id);
    vi.advanceTimersByTime(1500);
    expect(a).not.toHaveBeenCalled();
    timer.cancelAll();
    vi.advanceTimersByTime(1000);
    expect(b).not.toHaveBeenCalled();
    expect(timer.activeCount).toBe(0);
  });
});

describe("SessionService", () => {
  test("finish returns the record once (no double counting)", () => {
    const s = new SessionService("pc");
    s.start({ id: "t1", name: "Task" }, new Date("2026-10-06T09:00:00Z"));
    const r = s.finish("interval", new Date("2026-10-06T09:31:59Z"));
    expect(r).toMatchObject({ taskId: "t1", taskName: "Task", elapsedMinutes: 31, endReason: "interval", device: "pc" });
    expect(s.finish("app_exit")).toBeNull();
  });
});

describe("TaskService with JSON file", () => {
  test("CRUD, soft delete and persistence", async () => {
    const file = join(dir, "store.json");
    const changed = vi.fn();
    const service = new TaskService(new JsonFileTaskRepository(file), changed);

    const a = await service.add({ name: "A", priority: "SOMEDAY", memo: "" });
    const b = await service.add({ name: "B", priority: "NOW", memo: "memo" });
    expect((await service.listIncomplete()).map((t) => t.name)).toEqual(["B", "A"]);

    await service.update(a.id, { name: "A2", priority: "SOONER", memo: "m" });
    await service.complete(b.id);
    expect((await service.listIncomplete()).map((t) => t.name)).toEqual(["A2"]);
    expect((await service.listAll()).map((t) => t.name)).toEqual(["A2", "B"]);

    await service.reopen(b.id);
    await service.remove(a.id);
    expect((await service.listAll()).map((t) => t.name)).toEqual(["B"]);
    await expect(service.update(a.id, { name: "x", priority: "NOW", memo: "" })).rejects.toThrow();

    expect(changed).toHaveBeenCalledTimes(6);

    // Reload from disk
    const reloaded = new TaskService(new JsonFileTaskRepository(file));
    const all = await reloaded.listAll();
    expect(all.map((t) => [t.name, t.memo, t.completed])).toEqual([["B", "memo", false]]);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  test("recordSession appends a session and adds minutes", async () => {
    const file = join(dir, "store.json");
    const service = new TaskService(new JsonFileTaskRepository(file));
    const t = await service.add({ name: "A", priority: "NOW", memo: "" });
    const sessions = new SessionService("pc");
    sessions.start(t, new Date("2026-10-06T09:00:00Z"));
    await service.recordSession(sessions.finish("completed", new Date("2026-10-06T09:20:00Z")));
    sessions.start(t, new Date("2026-10-06T10:00:00Z"));
    await service.recordSession(sessions.finish("interval", new Date("2026-10-06T10:30:00Z")));
    await service.recordSession(null);

    const [task] = await service.listAll();
    expect(task.totalMinutes).toBe(50);
    expect(task.sessionCount).toBe(2);
    const stored = JSON.parse(readFileSync(file, "utf8"));
    expect(stored.sessions).toHaveLength(2);
  });

  test("last selected task is kept in preferences", async () => {
    const service = new TaskService(new JsonFileTaskRepository(join(dir, "store.json")));
    const t = await service.add({ name: "A", priority: "NOW", memo: "" });
    await service.markLastSelected(t.id);
    expect((await service.getPreferences()).lastSelectedTaskId).toBe(t.id);
  });

  test("legacy import seeds a new store", async () => {
    const file = join(dir, "store.json");
    const repo = new JsonFileTaskRepository(file);
    expect(repo.exists).toBe(false);
    repo.importLegacy(
      [
        {
          id: "a",
          name: "Old",
          memo: "",
          priority: "NOW",
          completed: false,
          completedAt: null,
          deleted: false,
          totalMinutes: 10,
          sessionCount: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-10-06T00:00:00.000Z",
          updatedBy: "migration",
        },
      ],
      "a",
      new Date(),
    );
    expect(repo.exists).toBe(true);
    const service = new TaskService(new JsonFileTaskRepository(file));
    expect((await service.listAll())[0].name).toBe("Old");
    expect((await service.getPreferences()).lastSelectedTaskId).toBe("a");
  });
});

describe("LeaveScheduleService", () => {
  test("fires warning 5 minutes before stop, then stop", () => {
    vi.useFakeTimers();
    const now = new Date(2026, 9, 6, 23, 0);
    vi.setSystemTime(now);
    const onWarning = vi.fn();
    const onStop = vi.fn();
    const leave = new LeaveScheduleService(new TimerService(), { onWarning, onStop });

    leave.scheduleLeave({ leaveTime: "23:30", bufferMinutes: 15 }, now); // stop 23:15, warn 23:10
    expect(leave.status()?.bufferMinutes).toBe(15);

    vi.advanceTimersByTime(10 * 60_000 - 1);
    expect(onWarning).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onWarning).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(5 * 60_000);
    expect(onStop).toHaveBeenCalledOnce();
  });

  test("cancel stops both timers", () => {
    vi.useFakeTimers();
    const now = new Date(2026, 9, 6, 23, 0);
    const onWarning = vi.fn();
    const onStop = vi.fn();
    const leave = new LeaveScheduleService(new TimerService(), { onWarning, onStop });
    leave.scheduleLeave({ leaveTime: "23:30", bufferMinutes: 15 }, now);
    leave.cancel();
    vi.advanceTimersByTime(60 * 60_000);
    expect(onWarning).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
    expect(leave.status()).toBeNull();
  });
});
