import { describe, expect, test } from "vitest";
import type { Task } from "@shared/task";
import { dropOf, entriesOf, groupTasks, moved, stepDrop, withoutEmptyHeadings } from "@shared/taskList";

function task(id: string, priority: Task["priority"] = "NOW"): Task {
  return {
    id,
    name: id,
    memo: "",
    priority,
    completed: false,
    completedAt: null,
    deleted: false,
    totalMinutes: 0,
    sessionCount: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    updatedBy: "desktop",
  };
}

const groups = groupTasks([task("n1"), task("n2"), task("s1", "SOMEDAY")]);
const keys = (entries: { key: string }[]) => entries.map((e) => e.key);

describe("task list entries", () => {
  test("headings of the groups with their tasks; all headings while dragging", () => {
    expect(keys(entriesOf(groups, false))).toEqual(["heading:NOW", "n1", "n2", "heading:SOMEDAY", "s1"]);
    expect(keys(entriesOf(groups, true))).toEqual([
      "heading:NOW",
      "n1",
      "n2",
      "heading:ROUTINE",
      "heading:SOONER",
      "heading:ANYTIME",
      "heading:SOMEDAY",
      "s1",
      "heading:BREAK",
    ]);
  });

  test("a task moved past a heading lands under it; nothing goes above the first heading", () => {
    const entries = entriesOf(groups, true);
    const next = moved(entries, 2, 3);
    expect(keys(next).slice(0, 4)).toEqual(["heading:NOW", "n1", "heading:ROUTINE", "n2"]);
    expect(dropOf(next, "n2")).toEqual({ taskId: "n2", priority: "ROUTINE", orderedIds: ["n2"] });
    expect(dropOf(next, "n1")).toEqual({ taskId: "n1", priority: "NOW", orderedIds: ["n1"] });
    expect(keys(moved(entries, 1, 0))).toEqual(keys(entries));
    expect(dropOf(entries, "missing")).toBeNull();
  });

  test("Alt+arrow steps one line, into the neighboring priority past a heading", () => {
    expect(stepDrop(groups, "n1", 1)).toEqual({ taskId: "n1", priority: "NOW", orderedIds: ["n2", "n1"] });
    expect(stepDrop(groups, "n2", 1)).toEqual({ taskId: "n2", priority: "ROUTINE", orderedIds: ["n2"] });
    expect(stepDrop(groups, "s1", -1)).toEqual({ taskId: "s1", priority: "ANYTIME", orderedIds: ["s1"] });
    expect(stepDrop(groups, "n1", -1)).toBeNull();
    expect(stepDrop(groups, "s1", 1)).toEqual({ taskId: "s1", priority: "BREAK", orderedIds: ["s1"] });
  });

  test("after a drop only the headings with tasks stay", () => {
    const dropped = moved(entriesOf(groups, true), 2, 3);
    expect(keys(withoutEmptyHeadings(dropped))).toEqual([
      "heading:NOW",
      "n1",
      "heading:ROUTINE",
      "n2",
      "heading:SOMEDAY",
      "s1",
    ]);
  });
});
