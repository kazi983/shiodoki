// Pure logic behind the autosaving task edit panel (ManagementPage).
//
// A draft is the form the user types into plus a baseline: the values last saved (or last seen
// from the store). Only the fields that differ from the baseline are sent, so a save never
// overwrites what another device changed in the other fields, and the form is never replaced
// by the saved result while the user keeps typing.

import { MAX_MEMO_LENGTH, MAX_NAME_LENGTH, normalizeTaskInput, type TaskInput } from "./task";

export interface TaskDraft {
  /** Last saved values (trimmed, as stored). */
  base: TaskInput;
  /** What the form shows. Text is kept as typed: trimming it would eat a space the user just typed. */
  form: TaskInput;
}

const FIELDS = ["name", "priority", "memo"] as const;
type Field = (typeof FIELDS)[number];

function sameValue(field: Field, a: TaskInput, b: TaskInput): boolean {
  return field === "priority" ? a.priority === b.priority : a[field].trim() === b[field].trim();
}

export function draftFromTask(task: TaskInput): TaskDraft {
  const base = { name: task.name, priority: task.priority, memo: task.memo };
  return { base, form: { ...base } };
}

/** Fields whose form value differs from the baseline (surrounding whitespace ignored). */
export function dirtyFields(draft: TaskDraft): Field[] {
  return FIELDS.filter((field) => !sameValue(field, draft.base, draft.form));
}

/** The validation message for the form, or null when it can be saved. */
export function draftError(draft: TaskDraft): string | null {
  try {
    normalizeTaskInput(draft.form);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** The changed fields, trimmed, ready for `tasks.update`. Empty when nothing changed. */
export function draftPatch(draft: TaskDraft): Partial<TaskInput> {
  const patch: Partial<TaskInput> = {};
  for (const field of dirtyFields(draft)) {
    if (field === "priority") patch.priority = draft.form.priority;
    else patch[field] = draft.form[field].trim();
  }
  return patch;
}

/** After a successful save: the sent values become the baseline. The form is left alone. */
export function markSaved(draft: TaskDraft, patch: Partial<TaskInput>): TaskDraft {
  return { ...draft, base: { ...draft.base, ...patch } };
}

/** On leaving the task: put back the saved value of any field that cannot be saved. */
export function revertInvalid(draft: TaskDraft): TaskDraft {
  const name = draft.form.name.trim();
  const form = { ...draft.form };
  if (!name || name.length > MAX_NAME_LENGTH) form.name = draft.base.name;
  if (form.memo.trim().length > MAX_MEMO_LENGTH) form.memo = draft.base.memo;
  return { ...draft, form };
}

/**
 * A newer copy of the task arrived from the store (this device's save or another device).
 * Fields the user has not touched follow it; fields being edited keep the typed value.
 */
export function rebaseDraft(draft: TaskDraft, stored: TaskInput): TaskDraft {
  const dirty = dirtyFields(draft);
  const form = { ...draft.form };
  for (const field of FIELDS) {
    // Same value apart from whitespace (e.g. the echo of our own save): keep the text as typed.
    if (dirty.includes(field) || sameValue(field, draft.form, stored)) continue;
    if (field === "priority") form.priority = stored.priority;
    else form[field] = stored[field];
  }
  return { base: { name: stored.name, priority: stored.priority, memo: stored.memo }, form };
}
