import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PickerState } from "@shared/ipc";
import {
  BUFFER_OPTIONS,
  DEFAULT_BUFFER_MINUTES,
  DEFAULT_LEAVE_TIME,
  buildLeaveSchedule,
  formatHHMM,
  normalizeTimeInput,
} from "@shared/leave";
import { PRIORITIES, PRIORITY_META, formatDuration, type Task } from "@shared/task";
import { alertError } from "../errors";
import { ClockIcon, EditIcon, PlayIcon, PlusIcon, PowerIcon, SnoozeIcon } from "../icons";
import { SyncBadge } from "../SyncBadge";
import { useNow } from "../useNow";

/** "30分" / "5秒" (TASK_MODE=test uses seconds). */
function durationLabel(ms: number): string {
  return ms >= 60_000 ? `${Math.round(ms / 60_000)}分` : `${Math.round(ms / 1000)}秒`;
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

  const tasks = state?.tasks ?? [];
  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const lastTask = tasks.find((t) => t.id === state?.lastSelectedTaskId) ?? null;
  const intervalLabel = durationLabel(state?.intervalMs ?? 30 * 60_000);
  const snoozeLabel = durationLabel(state?.snoozeMs ?? 5 * 60_000);
  const groups = PRIORITIES.map((p) => ({ priority: p, tasks: tasks.filter((t) => t.priority === p) })).filter(
    (g) => g.tasks.length > 0,
  );

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
        await window.api.dialog.alert("未選択", "タスクを選んでください");
        return;
      }
      if (!(await window.api.dialog.confirm("開始", `${task.name} を開始しますか？`))) return;
      const leave = state?.leave ? undefined : { leaveTime: normalizeTimeInput(leaveTime), bufferMinutes };
      await window.api.picker.startSession({ taskId: task.id, leave });
    });

  const completeTask = (task: Task | null) =>
    run(async () => {
      if (!task) return;
      if (!(await window.api.dialog.confirm("完了", `${task.name} を完了にしますか？`))) return;
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
      if (await window.api.dialog.confirm("終了", "アプリを終了しますか？")) await window.api.nav.exit();
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
        <h1>今から何をやる？</h1>
        <p className="sub">次の{intervalLabel}で取り組むタスクを1つ選びます</p>
      </header>

      {lastTask && (
        <button type="button" className="resume-card" onClick={() => void startSession(lastTask)} disabled={busy}>
          <span className="resume-play">
            <PlayIcon />
          </span>
          <span className="resume-body">
            <span className="resume-label">前回の続き</span>
            <span className="resume-name ellipsis">{lastTask.name}</span>
            <span className="resume-meta">
              累計 {formatDuration(lastTask.totalMinutes)} · {lastTask.sessionCount} セッション
            </span>
          </span>
          {selectedId === lastTask.id && (
            <span className="resume-kbd" title="入力欄が空のときに Enter で開始">
              Enter
            </span>
          )}
        </button>
      )}

      <section className="leave-row" aria-label="次の予定">
        <ClockIcon />
        {state?.leave ? (
          <>
            <span>
              次の予定 <span className="mono">{formatHHMM(new Date(state.leave.leaveAt))}</span> の
              {state.leave.bufferMinutes}分前
            </span>
            <button type="button" className="link-btn" onClick={changeLeave}>
              変更
            </button>
          </>
        ) : (
          <>
            <label>
              次の予定
              <input
                className="field-sm input-time"
                value={leaveTime}
                onChange={(e) => setLeaveTime(e.target.value)}
                aria-label="次の予定の時刻"
                placeholder="18:30"
              />
            </label>
            <label>
              の
              <select
                className="field-sm"
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Number(e.target.value))}
                aria-label="何分前に止めるか"
              >
                {BUFFER_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}分前
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <span className="leave-stop" title="作業終了時刻">
          {stopPreview ? (
            <>
              <span className="mono">{stopPreview}</span> まで作業
            </>
          ) : (
            "時刻を入力"
          )}
        </span>
      </section>

      <div className="add-row">
        <input
          ref={inputRef}
          className="field"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="新しいタスクを入力して Enter"
          aria-label="新しいタスク"
        />
        <button type="button" className="btn btn-icon" onClick={addTask} aria-label="タスクを追加">
          <PlusIcon />
        </button>
      </div>

      <div
        ref={listRef}
        className="task-list scroll scroll-fade"
        role="listbox"
        tabIndex={0}
        aria-label="タスク一覧"
        onKeyDown={onListKeyDown}
      >
        {tasks.length === 0 && <p className="list-empty">タスクがありません。上の入力欄から追加してください。</p>}
        {groups.map((group) => (
          <div key={group.priority} className="task-group" role="group" aria-label={PRIORITY_META[group.priority].label}>
            <div className="group-label" aria-hidden>
              <span className="group-dot" style={{ background: PRIORITY_META[group.priority].dot }} />
              {group.priority}
              <span className="jp">{PRIORITY_META[group.priority].label}</span>
            </div>
            {group.tasks.map((task) => (
              <div
                key={task.id}
                className="task-option"
                role="option"
                aria-selected={task.id === selectedId}
                onClick={() => setSelectedId(task.id)}
                onDoubleClick={() => void startSession(task)}
              >
                <span className="task-name ellipsis" title={task.name}>
                  {task.name}
                </span>
                <span className="task-time">{formatDuration(task.totalMinutes)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <footer className="picker-actions">
        <button
          type="button"
          className="btn btn-primary btn-large start-btn"
          onClick={() => void startSession(selected)}
          disabled={busy}
        >
          <PlayIcon />
          {intervalLabel}はじめる
        </button>
        <div className="secondary-row">
          <button type="button" className="btn btn-outline" onClick={() => void window.api.picker.snooze()}>
            <SnoozeIcon />
            {snoozeLabel}後に <span className="kbd">Esc</span>
          </button>
          <button type="button" className="btn btn-outline" onClick={() => void window.api.nav.openManagement()}>
            <EditIcon />
            タスク管理
          </button>
          <button type="button" className="btn btn-outline" onClick={exitApp}>
            <PowerIcon />
            終了
          </button>
        </div>
      </footer>
    </main>
  );
}
