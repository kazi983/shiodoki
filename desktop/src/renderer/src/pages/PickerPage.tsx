import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { t } from "@shared/i18n";
import type { PickerState } from "@shared/ipc";
import {
  BUFFER_OPTIONS,
  DEFAULT_BUFFER_MINUTES,
  DEFAULT_LEAVE_TIME,
  buildLeaveSchedule,
  formatHHMM,
  normalizeTimeInput,
} from "@shared/leave";
import { PRIORITY_META, formatDuration, type Priority, type Task } from "@shared/task";
import { groupTasks, type TaskListEntry } from "@shared/taskList";
import { alertError } from "../errors";
import { ClockIcon, EditIcon, PlayIcon, PlusIcon, PowerIcon, SnoozeIcon } from "../icons";
import { SyncBadge } from "../SyncBadge";
import { TaskDragContext, useSortableLine, useTaskDrag } from "../taskDrag";
import { useNow } from "../useNow";

/** "30分" / "5秒" (TASK_MODE=test uses seconds). */
function durationLabel(ms: number): string {
  const { units } = t();
  return ms >= 60_000 ? units.minutes(Math.round(ms / 60_000)) : units.seconds(Math.round(ms / 1000));
}

/** Stop time for the leave inputs, or null while the time is incomplete. */
function previewStop(leaveTime: string, bufferMinutes: number, now: Date): string | null {
  try {
    return formatHHMM(buildLeaveSchedule({ leaveTime, bufferMinutes }, now).stopAt);
  } catch {
    return null;
  }
}

/** "Quick Start": asks what to work on next. */
export function PickerPage() {
  const [state, setState] = useState<PickerState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [leaveTime, setLeaveTime] = useState(DEFAULT_LEAVE_TIME);
  const [bufferMinutes, setBufferMinutes] = useState(DEFAULT_BUFFER_MINUTES);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const now = useNow(10_000);
  const { common, picker: text } = t();

  const load = useCallback(async (selectId?: string) => {
    const next = await window.api.picker.getState();
    setState(next);
    setSelectedId((current) => {
      const ids = next.tasks.map((t) => t.id);
      if (selectId && ids.includes(selectId)) return selectId;
      if (current && ids.includes(current)) return current;
      if (next.lastSelectedTaskId && ids.includes(next.lastSelectedTaskId)) return next.lastSelectedTaskId;
      return ids[0] ?? null;
    });
  }, []);

  useEffect(() => {
    document.title = "Quick Start";
    void load();
    inputRef.current?.focus();
    const offChanged = window.api.tasks.onChanged(() => void load());
    const offRefresh = window.api.picker.onRefresh(() => {
      void load();
      inputRef.current?.focus();
    });
    return () => {
      offChanged();
      offRefresh();
    };
  }, [load]);

  // Esc: remind me again later.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) void window.api.picker.snooze();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const tasks = useMemo(() => state?.tasks ?? [], [state]);
  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const lastTask = tasks.find((t) => t.id === state?.lastSelectedTaskId) ?? null;
  const intervalLabel = durationLabel(state?.intervalMs ?? 30 * 60_000);
  const snoozeLabel = durationLabel(state?.snoozeMs ?? 5 * 60_000);
  const groups = useMemo(() => groupTasks(tasks), [tasks]);
  // A row dragged under another heading changes priority (requirements §5.5).
  const drag = useTaskDrag(groups, (drop) => window.api.tasks.move(drop, true));

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      await alertError(error);
    } finally {
      setBusy(false);
    }
  }

  const addTask = () =>
    run(async () => {
      if (!newName.trim()) return;
      const task = await window.api.tasks.add({ name: newName, priority: "NOW", memo: "" });
      setNewName("");
      await load(task.id);
    });

  const startSession = (task: Task | null) =>
    run(async () => {
      if (!task) {
        await window.api.dialog.alert(text.notSelectedTitle, text.notSelectedMessage);
        return;
      }
      if (!(await window.api.dialog.confirm(text.startTitle, text.startConfirm(task.name)))) return;
      const leave = state?.leave ? undefined : { leaveTime: normalizeTimeInput(leaveTime), bufferMinutes };
      await window.api.picker.startSession({ taskId: task.id, leave });
    });

  const completeTask = (task: Task | null) =>
    run(async () => {
      if (!task) return;
      if (!(await window.api.dialog.confirm(text.completeTitle, text.completeConfirm(task.name)))) return;
      await window.api.tasks.complete(task.id);
    });

  const changeLeave = () =>
    run(async () => {
      if (state?.leave) {
        setLeaveTime(formatHHMM(new Date(state.leave.leaveAt)));
        setBufferMinutes(state.leave.bufferMinutes);
      }
      await window.api.picker.cancelLeaveSchedule();
      await load();
    });

  const exitApp = () =>
    run(async () => {
      if (await window.api.dialog.confirm(common.quit, common.quitConfirm)) await window.api.nav.exit();
    });

  function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = tasks.findIndex((t) => t.id === selectedId);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? Math.min(index + 1, tasks.length - 1) : Math.max(index - 1, 0);
      if (tasks[next]) setSelectedId(tasks[next].id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      void startSession(selected);
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      void completeTask(selected);
    }
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    // Enter on an empty input starts the selected task (the previous one by default).
    if (newName.trim()) void addTask();
    else void startSession(selected);
  }

  const stopPreview = state?.leave
    ? formatHHMM(new Date(state.leave.stopAt))
    : previewStop(leaveTime, bufferMinutes, now);

  return (
    <main className="picker">
      <div className="topbar">
        <SyncBadge />
        {state?.testMode && <span className="test-badge">TEST MODE</span>}
        <span className="clock">{formatHHMM(now)}</span>
      </div>

      <header className="picker-header">
        <h1>{text.title}</h1>
        <p className="sub">{text.subtitle(intervalLabel)}</p>
      </header>

      {lastTask && (
        <button type="button" className="resume-card" onClick={() => void startSession(lastTask)} disabled={busy}>
          <span className="resume-play">
            <PlayIcon />
          </span>
          <span className="resume-body">
            <span className="resume-label">{text.resumeLabel}</span>
            <span className="resume-name ellipsis">{lastTask.name}</span>
            <span className="resume-meta">
              {text.resumeMeta(formatDuration(lastTask.totalMinutes), lastTask.sessionCount)}
            </span>
          </span>
          {selectedId === lastTask.id && (
            <span className="resume-kbd" title={text.resumeKbdTitle}>
              Enter
            </span>
          )}
        </button>
      )}

      <section className="leave-row" aria-label={text.nextPlan}>
        <ClockIcon />
        {state?.leave ? (
          <>
            <span>
              {text.nextPlanSet(
                <span key="time" className="mono">
                  {formatHHMM(new Date(state.leave.leaveAt))}
                </span>,
                state.leave.bufferMinutes,
              )}
            </span>
            <button type="button" className="link-btn" onClick={changeLeave}>
              {text.change}
            </button>
          </>
        ) : (
          <>
            <label>
              {text.nextPlan}
              <input
                className="field-sm input-time"
                value={leaveTime}
                onChange={(e) => setLeaveTime(e.target.value)}
                aria-label={text.nextPlanTime}
                placeholder="18:30"
              />
            </label>
            <label>
              {text.bufferJoiner}
              <select
                className="field-sm"
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Number(e.target.value))}
                aria-label={text.bufferLabel}
              >
                {BUFFER_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {text.bufferOption(m)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <span className="leave-stop" title={text.stopTimeTitle}>
          {stopPreview
            ? text.workUntil(
                <span key="time" className="mono">
                  {stopPreview}
                </span>,
              )
            : text.enterTime}
        </span>
      </section>

      <div className="add-row">
        <input
          ref={inputRef}
          className="field"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder={common.newTaskPlaceholder}
          aria-label={common.newTask}
        />
        <button type="button" className="btn btn-icon" onClick={addTask} aria-label={text.addTask}>
          <PlusIcon />
        </button>
      </div>

      <div
        ref={listRef}
        className="task-list scroll scroll-fade"
        role="listbox"
        tabIndex={0}
        aria-label={common.taskList}
        onKeyDown={onListKeyDown}
      >
        {tasks.length === 0 && <p className="list-empty">{text.empty}</p>}
        <TaskDragContext drag={drag}>
          {drag.entries.map((entry, index) => (
            <PickerLine
              key={entry.key}
              entry={entry}
              first={index === 0}
              selected={entry.key === selectedId}
              dropPriority={entry.key === drag.activeId ? drag.overPriority : null}
              onSelect={setSelectedId}
              onStart={(task) => void startSession(task)}
            />
          ))}
        </TaskDragContext>
      </div>

      <footer className="picker-actions">
        <button
          type="button"
          className="btn btn-primary btn-large start-btn"
          onClick={() => void startSession(selected)}
          disabled={busy}
        >
          <PlayIcon />
          {text.start(intervalLabel)}
        </button>
        <div className="secondary-row">
          <button type="button" className="btn btn-outline" onClick={() => void window.api.picker.snooze()}>
            <SnoozeIcon />
            {text.snooze(
              snoozeLabel,
              <span key="kbd" className="kbd">
                Esc
              </span>,
            )}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => void window.api.nav.openManagement()}>
            <EditIcon />
            {common.manageTasks}
          </button>
          <button type="button" className="btn btn-outline" onClick={exitApp}>
            <PowerIcon />
            {common.quit}
          </button>
        </div>
      </footer>
    </main>
  );
}

/** A priority heading or a task option of the picker list; task options can be dragged. */
function PickerLine({
  entry,
  first,
  selected,
  dropPriority,
  onSelect,
  onStart,
}: {
  entry: TaskListEntry;
  first: boolean;
  selected: boolean;
  /** While dragged: the priority it would land in, shown as a color bar. */
  dropPriority: Priority | null;
  onSelect: (id: string) => void;
  onStart: (task: Task) => void;
}) {
  const { priority, picker: text } = t();
  const { ref, listeners, style, isDragging } = useSortableLine(entry, first);
  if (entry.kind === "heading") {
    return (
      <div ref={ref} style={style} className="group-label">
        <span className="group-dot" style={{ background: PRIORITY_META[entry.priority].dot }} />
        {PRIORITY_META[entry.priority].shortName}
        {text.showPriorityLabel && <span className="jp">{priority[entry.priority]}</span>}
      </div>
    );
  }
  const { task } = entry;
  return (
    <div
      ref={ref}
      style={
        dropPriority ? { ...style, boxShadow: `inset 4px 0 0 ${PRIORITY_META[dropPriority].dot}, var(--lift)` } : style
      }
      className={isDragging ? "task-option dragging" : "task-option"}
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(task.id)}
      onDoubleClick={() => onStart(task)}
      {...listeners}
    >
      <span className="task-name ellipsis" title={task.name}>
        {task.name}
      </span>
      <span className="task-time">{formatDuration(task.totalMinutes)}</span>
    </div>
  );
}
