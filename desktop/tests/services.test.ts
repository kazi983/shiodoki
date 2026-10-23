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
    expect(r).toMatchObject({
      taskId: "t1",
      taskName: "Task",
      elapsedMinutes: 31,
      endReason: "interval",
      device: "pc",
    });
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

    // A partial patch writes only its fields and is validated with the stored ones.
    expect(await service.update(b.id, { memo: " new " })).toMatchObject({ name: "B", priority: "NOW", memo: "new" });
    await expect(service.update(b.id, { name: " " })).rejects.toThrow();

    expect(changed).toHaveBeenCalledTimes(7);

    // Reload from disk
    const reloaded = new TaskService(new JsonFileTaskRepository(file));
    const all = await reloaded.listAll();
    expect(all.map((t) => [t.name, t.memo, t.completed])).toEqual([["B", "new", false]]);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  test("new tasks and tasks moved to another priority go to its end", async () => {
    let clock = Date.parse("2026-10-06T09:00:00.000Z");
    const now = () => new Date((clock += 1000));
    const service = new TaskService(new JsonFileTaskRepository(join(dir, "store.json")), () => {}, now);
    const a = await service.add({ name: "A", priority: "NOW", memo: "" });
    const b = await service.add({ name: "B", priority: "SOMEDAY", memo: "" });
    expect(b.sortOrder).toBeGreaterThan(a.sortOrder!);

    // B moves into NOW after A, even with a clock that is behind A's position.
    clock = Date.parse("2026-01-01T00:00:00.000Z");
    const moved = await service.update(b.id, { priority: "NOW" });
    expect(moved.sortOrder).toBe(a.sortOrder! + 1000);
    expect((await service.listIncomplete()).map((t) => t.name)).toEqual(["A", "B"]);

    // Other fields keep the position.
    expect((await service.update(b.id, { name: "B2" })).sortOrder).toBe(moved.sortOrder);
  });

  test("move writes a drop; a completed task only changes priority", async () => {
    let clock = Date.parse("2026-10-06T09:00:00.000Z");
    const now = () => new Date((clock += 1000));
    const changed = vi.fn();
    const service = new TaskService(new JsonFileTaskRepository(join(dir, "store.json")), changed, now);
    const a = await service.add({ name: "A", priority: "NOW", memo: "" });
    const b = await service.add({ name: "B", priority: "NOW", memo: "" });
    const c = await service.add({ name: "C", priority: "SOMEDAY", memo: "" });
    changed.mockClear();

    // C dropped between A and B: it moves into NOW.
    expect(await service.move({ taskId: c.id, priority: "NOW", orderedIds: [a.id, c.id, b.id] }, true)).toBe(true);
    expect((await service.listIncomplete()).map((t) => t.name)).toEqual(["A", "C", "B"]);
    expect(changed).toHaveBeenCalledTimes(1);
    // Dropped where it is: nothing written.
    expect(await service.move({ taskId: c.id, priority: "NOW", orderedIds: [a.id, c.id, b.id] }, true)).toBe(false);

    // A completed task keeps its place in the completed order; it goes to the end of the new priority.
    await service.complete(a.id);
    expect(await service.move({ taskId: a.id, priority: "NOW", orderedIds: [a.id] }, false)).toBe(false);
    expect(await service.move({ taskId: a.id, priority: "SOONER", orderedIds: [a.id] }, false)).toBe(true);
    await service.reopen(a.id);
    expect((await service.get(a.id)).priority).toBe("SOONER");

    await expect(service.move({ taskId: c.id, priority: "HIGH" as never, orderedIds: [] }, true)).rejects.toThrow();
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
