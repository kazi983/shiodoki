import { describe, expect, test } from "vitest";
import { MAX_NAME_LENGTH, type TaskInput } from "@shared/task";
import {
  dirtyFields,
  draftError,
  draftFromTask,
  draftPatch,
  markSaved,
  rebaseDraft,
  revertInvalid,
  type TaskDraft,
} from "@shared/taskDraft";

const stored: TaskInput = { name: "買い物", priority: "NOW", memo: "牛乳" };

function edited(form: Partial<TaskInput>): TaskDraft {
  const draft = draftFromTask(stored);
  return { ...draft, form: { ...draft.form, ...form } };
}

describe("taskDraft", () => {
  test("a fresh draft has nothing to save", () => {
    const draft = draftFromTask(stored);
    expect(dirtyFields(draft)).toEqual([]);
    expect(draftPatch(draft)).toEqual({});
  });

  test("the patch has only the changed fields, trimmed", () => {
    expect(draftPatch(edited({ memo: " 卵 " }))).toEqual({ memo: "卵" });
    expect(draftPatch(edited({ priority: "SOMEDAY" }))).toEqual({ priority: "SOMEDAY" });
  });

  test("whitespace alone is not a change", () => {
    expect(dirtyFields(edited({ name: "買い物 " }))).toEqual([]);
  });

  test("an empty or too long name is reported and reverted on leave", () => {
    expect(draftError(edited({ name: "  " }))).toBeTruthy();
    expect(draftError(edited({ name: "x".repeat(MAX_NAME_LENGTH + 1) }))).toBeTruthy();
    expect(draftError(edited({ name: "ok" }))).toBeNull();

    const reverted = revertInvalid(edited({ name: "", memo: "卵" }));
    expect(reverted.form).toEqual({ name: "買い物", priority: "NOW", memo: "卵" });
    expect(draftPatch(reverted)).toEqual({ memo: "卵" });
  });

  test("markSaved moves the baseline and keeps the form as typed", () => {
    const draft = edited({ name: "買い物 ", memo: "卵" });
    const saved = markSaved(draft, draftPatch(draft));
    expect(saved.form.name).toBe("買い物 ");
    expect(dirtyFields(saved)).toEqual([]);
  });

  test("rebase: untouched fields follow the store, edited fields keep the typed value", () => {
    const draft = edited({ name: "買い物リスト" });
    const rebased = rebaseDraft(draft, { name: "別端末の名前", priority: "SOONER", memo: "パン" });
    expect(rebased.form).toEqual({ name: "買い物リスト", priority: "SOONER", memo: "パン" });
    expect(draftPatch(rebased)).toEqual({ name: "買い物リスト" });
  });

  test("rebase on the echo of our own save keeps a trailing space", () => {
    const draft = edited({ name: "買い物 " });
    const rebased = rebaseDraft(draft, stored);
    expect(rebased.form.name).toBe("買い物 ");
  });
});
