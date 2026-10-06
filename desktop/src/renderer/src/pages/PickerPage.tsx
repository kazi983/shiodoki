import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PickerState } from "@shared/ipc";
import {
  BUFFER_OPTIONS,
  DEFAULT_BUFFER_MINUTES,
  DEFAULT_LEAVE_TIME,
  formatHHMM,
  normalizeTimeInput,
} from "@shared/leave";
import { PRIORITY_META, type Task } from "@shared/task";
import { alertError } from "../errors";
import { SyncBadge } from "../SyncBadge";

/** "Quick Start": asks what to work on next. */
export function PickerPage() {
  const [state, setState] = useState<PickerState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [leaveTime, setLeaveTime] = useState(DEFAULT_LEAVE_TIME);
  const [bufferMinutes, setBufferMinutes] = useState(DEFAULT_BUFFER_MINUTES);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

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

  // Esc: remind me again in 5 minutes.
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
  const lastTask = tasks.find((t) => t.id === state?.lastSelectedTaskId);

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

  function onListKeyDown(e: KeyboardEvent<HTMLUListElement>) {
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

  return (
    <main className="picker">
      <div className="picker-badges">
        <SyncBadge tone="dark" />
        {state?.testMode && <span className="test-badge">TEST MODE</span>}
      </div>

      <header className="picker-header">
        <h1>今から何をやる？</h1>
        <p className="sub">{lastTask ? `前回の続き: ${lastTask.name}` : " "}</p>
      </header>

      <section className="leave-row" aria-label="退勤スケジュール">
        {state?.leave ? (
          <>
            <span title="作業終了時刻">⏰ {formatHHMM(new Date(state.leave.stopAt))} まで</span>
            <span title="退勤時刻と、その何分前に止めるか">
              💨 退勤 {formatHHMM(new Date(state.leave.leaveAt))} の{state.leave.bufferMinutes}分前
            </span>
            <button className="btn btn-secondary btn-small" onClick={changeLeave}>
              変更
            </button>
          </>
        ) : (
          <>
            <label>
              <span aria-hidden>⏰</span>
              <input
                className="input input-dark input-time"
                value={leaveTime}
                onChange={(e) => setLeaveTime(e.target.value)}
                aria-label="退勤時刻"
                placeholder="23:30"
              />
            </label>
            <label>
              <span aria-hidden>💨</span>
              <select
                className="input input-dark"
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
      </section>

      <section className="add-row">
        <input
          ref={inputRef}
          className="input input-dark"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void addTask();
          }}
          placeholder="新しいタスク"
          aria-label="新しいタスク"
        />
        <button className="btn btn-primary" onClick={addTask}>
          + 追加
        </button>
      </section>

      <ul
        ref={listRef}
        className="task-list"
        role="listbox"
        tabIndex={0}
        aria-label="タスク一覧"
        onKeyDown={onListKeyDown}
      >
        {tasks.length === 0 && <li className="empty">タスクがありません。上の入力欄から追加してください。</li>}
        {tasks.map((task) => (
          <li
            key={task.id}
            role="option"
            aria-selected={task.id === selectedId}
            onClick={() => setSelectedId(task.id)}
            onDoubleClick={() => void startSession(task)}
          >
            <span className="prio-icon" title={task.priority}>
              {PRIORITY_META[task.priority].icon}
            </span>
            <span className="task-name">{task.name}</span>
          </li>
        ))}
      </ul>

      <footer className="picker-actions">
        <button className="btn btn-primary btn-large" onClick={() => void startSession(selected)} disabled={busy}>
          ▶ はじめる
        </button>
        <div className="secondary-row">
          <button className="btn btn-secondary" onClick={() => void window.api.nav.openManagement()}>
            編集
          </button>
          <button className="btn btn-secondary" onClick={exitApp}>
            終了
          </button>
        </div>
        <p className="hint">Esc: 5分後にもう一度表示 / Enter: はじめる / Backspace: 完了</p>
      </footer>
    </main>
  );
}
