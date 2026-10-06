import { describe, expect, test } from "vitest";
import {
  buildLeaveSchedule,
  normalizeTimeInput,
  resolveNextOccurrence,
} from "@shared/leave";
import { convertLegacyTasks, legacyDataFile } from "@shared/legacy";
import {
  compareTasks,
  compareTasksForManagement,
  formatMinutes,
  normalizeTaskInput,
  type Task,
} from "@shared/task";
import { centeredBounds } from "../src/main/geometry";

function task(overrides: Partial<Task>): Task {
  return {
    id: "x",
    name: "t",
    memo: "",
    priority: "NOW",
    completed: false,
    completedAt: null,
    deleted: false,
    totalMinutes: 0,
    sessionCount: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    updatedBy: "desktop",
    ...overrides,
  };
}

describe("normalizeTimeInput", () => {
  test.each([
    ["9", "09:00"],
    ["930", "09:30"],
    ["1830", "18:30"],
    ["04:00", "04:00"],
    ["4:5", "04:05"],
    [" 23:30 ", "23:30"],
    ["23：30", "23:30"],
  ])("%j -> %s", (input, expected) => {
    expect(normalizeTimeInput(input)).toBe(expected);
  });

  test.each(["", "abc", "2460", "25:00", "12:60", "12345", "1:2:3"])("rejects %j", (input) => {
    expect(() => normalizeTimeInput(input)).toThrow();
  });
});

describe("leave schedule", () => {
  test("a time later today stays today", () => {
    const now = new Date(2026, 9, 6, 20, 0);
    expect(resolveNextOccurrence("23:30", now)).toEqual(new Date(2026, 9, 6, 23, 30));
  });

  test("a time already passed means tomorrow (crossing midnight)", () => {
    const now = new Date(2026, 9, 6, 22, 0);
    expect(resolveNextOccurrence("01:00", now)).toEqual(new Date(2026, 9, 7, 1, 0));
  });

  test("stop = leave - buffer, warning = stop - 5 minutes", () => {
    const now = new Date(2026, 9, 6, 20, 0);
    const s = buildLeaveSchedule({ leaveTime: "23:30", bufferMinutes: 15 }, now);
    expect(s.stopAt).toEqual(new Date(2026, 9, 6, 23, 15));
    expect(s.warnAt).toEqual(new Date(2026, 9, 6, 23, 10));
  });

  test("rejects a negative buffer", () => {
    expect(() => buildLeaveSchedule({ leaveTime: "23:30", bufferMinutes: -1 }, new Date())).toThrow();
  });
});

describe("task helpers", () => {
  test("sorts by priority, then oldest first", () => {
    const tasks = [
      task({ id: "someday", priority: "SOMEDAY" }),
      task({ id: "now-new", priority: "NOW", createdAt: "2026-10-03T00:00:00.000Z" }),
      task({ id: "anytime", priority: "ANYTIME" }),
      task({ id: "now-old", priority: "NOW", createdAt: "2026-10-01T00:00:00.000Z" }),
      task({ id: "sooner", priority: "SOONER" }),
    ];
    expect(tasks.sort(compareTasks).map((t) => t.id)).toEqual([
      "now-old",
      "now-new",
      "sooner",
      "anytime",
      "someday",
    ]);
  });

  test("management list puts completed tasks last", () => {
    const tasks = [task({ id: "done", completed: true }), task({ id: "open", priority: "SOMEDAY" })];
    expect(tasks.sort(compareTasksForManagement).map((t) => t.id)).toEqual(["open", "done"]);
  });

  test("normalizeTaskInput trims and validates", () => {
    expect(normalizeTaskInput({ name: "  a ", memo: " m ", priority: "SOONER" })).toEqual({
      name: "a",
      memo: "m",
      priority: "SOONER",
    });
    expect(() => normalizeTaskInput({ name: "  ", memo: "", priority: "NOW" })).toThrow("タスク名");
    expect(() => normalizeTaskInput({ name: "a", memo: "", priority: "HIGH" as never })).toThrow("優先度");
    expect(() => normalizeTaskInput({ name: "a".repeat(201), memo: "", priority: "NOW" })).toThrow();
  });

  test("formatMinutes", () => {
    expect(formatMinutes(0)).toBe("0分");
    expect(formatMinutes(45)).toBe("45分");
    expect(formatMinutes(125)).toBe("2時間5分");
  });
});

describe("legacy import", () => {
  const now = new Date("2026-10-06T00:00:00.000Z");
  let n = 0;
  const newId = () => `new-${++n}`;

  test("converts v1 tasks", () => {
    const { tasks, lastSelectedTaskId } = convertLegacyTasks(
      [
        {
          id: "a",
          name: "Write docs",
          memo: "memo",
          completed: false,
          priority: "SOONER",
          total_minutes: 90,
          completed_sessions: 3,
          created_at: "2026-09-01T10:00:00+00:00",
          last_selected: true,
          deleted: false,
        },
        { id: "b", name: "No priority", priority: "なし" },
        { id: "c", name: "Empty priority", priority: "", completed: true },
        { id: "d", name: "Deleted", deleted: true },
        { name: "No id", created_at: "broken" },
        { name: "   " },
      ],
      now,
      newId,
    );

    expect(tasks.map((t) => t.id)).toEqual(["a", "b", "c", "new-1"]);
    expect(lastSelectedTaskId).toBe("a");
    expect(tasks[0]).toMatchObject({
      name: "Write docs",
      memo: "memo",
      priority: "SOONER",
      totalMinutes: 90,
      sessionCount: 3,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedBy: "migration",
    });
    expect(tasks[1].priority).toBe("SOMEDAY");
    expect(tasks[2]).toMatchObject({ priority: "SOMEDAY", completed: true, completedAt: now.toISOString() });
    expect(tasks[3].createdAt).toBe(now.toISOString());
  });

  test("rejects a non-array file", () => {
    expect(() => convertLegacyTasks({}, now, newId)).toThrow();
  });

  test("finds the v1 data file like app/config/paths.py", () => {
    expect(legacyDataFile("linux", {}, "/home/u", false)).toBe("/home/u/.30min-task-timer/tasks.json");
    expect(legacyDataFile("linux", { XDG_CONFIG_HOME: "/x" }, "/home/u", true)).toBe(
      "/x/30min-task-timer/tasks_test.json",
    );
    expect(legacyDataFile("win32", { APPDATA: "C:\\AppData" }, "C:\\Users\\u", false)).toBe(
      "C:\\AppData\\30min-task-timer\\tasks.json",
    );
  });
});

describe("centeredBounds", () => {
  test("centers inside the work area of the given display", () => {
    const b = centeredBounds({ workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }, 520, 720);
    expect(b).toEqual({ x: 1920 + 700, y: 180, width: 520, height: 720 });
  });

  test("shrinks windows that do not fit (v1 used a fixed 1200x1400)", () => {
    const b = centeredBounds({ workArea: { x: 0, y: 0, width: 1366, height: 700 } }, 1200, 1400);
    expect(b.height).toBe(665);
    expect(b.y).toBeGreaterThanOrEqual(0);
  });
});
