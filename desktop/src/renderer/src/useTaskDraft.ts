import { useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskInput } from "@shared/task";
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

/** Save this long after the last keystroke. */
export const AUTOSAVE_DELAY_MS = 1000;

export type SaveStatus = "idle" | "pending" | "saved" | "failed";

interface Current {
  id: string;
  draft: TaskDraft;
}

/**
 * Autosaving edit form for the selected task (logic in `@shared/taskDraft`).
 * `edit` schedules a save, `flush` saves now, `leave` saves now and reverts invalid fields
 * first, `cancel` drops the pending save.
 */
export function useTaskDraft(task: Task | null) {
  const [current, setCurrentState] = useState<Current | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  // The latest draft for timers and async callbacks, which would otherwise see a stale render.
  const currentRef = useRef<Current | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // Saves run one after another so an older patch never lands after a newer one.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const api = useMemo(() => {
    function setCurrent(next: Current | null) {
      currentRef.current = next;
      setCurrentState(next);
    }

    function clearTimer() {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }

    function save(id: string, patch: Partial<TaskInput>): Promise<void> {
      if (Object.keys(patch).length === 0) return queue.current;
      queue.current = queue.current.then(async () => {
        try {
          await window.api.tasks.update(id, patch);
          const now = currentRef.current;
          if (now?.id !== id) return;
          setCurrent({ id, draft: markSaved(now.draft, patch) });
          setStatus(timer.current === undefined ? "saved" : "pending");
        } catch (error) {
          console.error("autosave failed", error);
          // The baseline is unchanged, so the fields stay dirty and the next edit or flush retries.
          if (currentRef.current?.id === id) setStatus("failed");
        }
      });
      return queue.current;
    }

    function flush(): Promise<void> {
      clearTimer();
      const now = currentRef.current;
      if (!now || draftError(now.draft)) return queue.current;
      return save(now.id, draftPatch(now.draft));
    }

    function edit(patch: Partial<TaskInput>) {
      const now = currentRef.current;
      if (!now) return;
      const next = { id: now.id, draft: { ...now.draft, form: { ...now.draft.form, ...patch } } };
      setCurrent(next);
      clearTimer();
      if (dirtyFields(next.draft).length === 0) {
        // Typed back to the saved value: nothing to save.
        setStatus((s) => (s === "idle" ? "idle" : "saved"));
        return;
      }
      setStatus("pending");
      timer.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    }

    function leave(): Promise<void> {
      clearTimer();
      const now = currentRef.current;
      if (!now) return queue.current;
      const reverted = { id: now.id, draft: revertInvalid(now.draft) };
      setCurrent(reverted);
      return save(reverted.id, draftPatch(reverted.draft));
    }

    function cancel() {
      clearTimer();
      setCurrent(null);
      setStatus("idle");
    }

    function sync(task: Task | null) {
      const now = currentRef.current;
      if (!task) {
        // Deselected, or deleted on another device: drop the pending save.
        if (now) cancel();
      } else if (now?.id !== task.id) {
        clearTimer();
        setCurrent({ id: task.id, draft: draftFromTask(task) });
        setStatus("idle");
      } else {
        setCurrent({ id: task.id, draft: rebaseDraft(now.draft, task) });
      }
    }

    return { edit, flush, leave, cancel, sync, clearTimer };
  }, []);

  useEffect(() => api.sync(task), [api, task]);

  useEffect(() => {
    // The window is closing (e.g. a leave block): best effort, the IPC message is sent before unload.
    const onPageHide = () => void api.leave();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      api.clearTimer();
    };
  }, [api]);

  const draft = current && task && current.id === task.id ? current.draft : null;
  return {
    form: draft?.form ?? null,
    error: draft ? draftError(draft) : null,
    status,
    edit: api.edit,
    flush: api.flush,
    leave: api.leave,
    cancel: api.cancel,
  };
}
