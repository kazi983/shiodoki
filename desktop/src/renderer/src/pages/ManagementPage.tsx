import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  PRIORITIES,
  PRIORITY_META,
  formatDuration,
  type Priority,
  type Task,
  type TaskInput,
} from "@shared/task";
import { alertError } from "../errors";
import { BackIcon, SearchIcon, TrashIcon } from "../icons";
import { SyncBadge } from "../SyncBadge";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${formatDate(iso)}`;
}

function matches(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || task.name.toLowerCase().includes(q) || task.memo.toLowerCase().includes(q);
}

/** Add / edit / complete / delete tasks: list on the left, the selected task on the right. */
export function ManagementPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskInput | null>(null);
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);
  const [busy, setBusy] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  const load = useCallback(async () => {
    setTasks(await window.api.tasks.listAll());
  }, []);

  useEffect(() => {
    document.title = "タスク管理";
    void load();
    addRef.current?.focus();
    return window.api.tasks.onChanged(() => void load());
  }, [load]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) void window.api.nav.openPicker();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = tasks.filter((t) => (showCompleted || !t.completed) && matches(t, query));
  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const openCount = tasks.filter((t) => !t.completed).length;
  const doneCount = tasks.length - openCount;

  useEffect(() => {
    tableRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function select(task: Task | null) {
    setSelectedId(task?.id ?? null);
    setForm(task ? { name: task.name, priority: task.priority, memo: task.memo } : null);
  }

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
      if (!newName.trim()) {
        await window.api.dialog.alert("未入力", "タスクを入力してください");
        return;
      }
      await window.api.tasks.add({ name: newName, priority: "NOW", memo: "" });
      // Keep the focus here so Enter adds the next task.
      setNewName("");
      addRef.current?.focus();
    });

  const updateTask = () =>
    run(async () => {
      if (!selected || !form) return;
      const changes: string[] = [];
      if (selected.name !== form.name.trim()) changes.push(`タスク: ${selected.name} ➤ ${form.name.trim()}`);
      if (selected.priority !== form.priority)
        changes.push(`優先度: ${PRIORITY_META[selected.priority].label} ➤ ${PRIORITY_META[form.priority].label}`);
      if (selected.memo !== form.memo.trim()) changes.push("メモを変更");
      if (changes.length === 0) {
        await window.api.dialog.alert("変更なし", "変更内容を入力してください");
        return;
      }
      if (!(await window.api.dialog.confirm("更新", `更新しますか？\n\n${changes.join("\n")}`))) return;
      const updated = await window.api.tasks.update(selected.id, form);
      select(updated);
    });

  const toggleComplete = (task: Task | null) =>
    run(async () => {
      if (!task) return;
      if (task.completed) {
        if (!(await window.api.dialog.confirm("未完了に戻す", `${task.name} を未完了に戻しますか？`))) return;
        await window.api.tasks.reopen(task.id);
      } else {
        if (!(await window.api.dialog.confirm("タスク完了", `${task.name} を完了済みタスクに登録しますか？`))) return;
        await window.api.tasks.complete(task.id);
      }
    });

  const removeTask = () =>
    run(async () => {
      if (!selected) return;
      if (!(await window.api.dialog.confirm("タスク削除", `${selected.name} を削除しますか？`))) return;
      await window.api.tasks.remove(selected.id);
      select(null);
    });

  function onTableKeyDown(e: KeyboardEvent<HTMLTableSectionElement>) {
    const index = visible.findIndex((t) => t.id === selectedId);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? Math.min(index + 1, visible.length - 1) : Math.max(index - 1, 0);
      if (visible[next]) select(visible[next]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      nameRef.current?.focus();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      void toggleComplete(selected);
    } else if (e.key === "Delete") {
      e.preventDefault();
      void removeTask();
    }
  }

  return (
    <main className="management">
      <header className="management-header">
        <button
          type="button"
          className="back-btn"
          onClick={() => void window.api.nav.openPicker()}
          aria-label="Quick Start に戻る"
          title="Quick Start に戻る (Esc)"
        >
          <BackIcon />
        </button>
        <div className="management-title">
          <h1>タスク管理</h1>
          <p className="sub">
            未完了 {openCount} 件 · 完了 {doneCount} 件
          </p>
        </div>
        <div className="header-tools">
          <label className="search">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="タスクを検索"
              aria-label="タスクを検索"
            />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
            完了済みも表示
          </label>
          <SyncBadge />
        </div>
      </header>

      <div className="management-body">
        <section className="table-card" aria-label="タスク一覧">
          <div className="table-add">
            <input
              ref={addRef}
              className="field"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void addTask();
              }}
              placeholder="新しいタスクを入力して Enter"
              aria-label="新しいタスク"
            />
            <button type="button" className="btn btn-primary" onClick={addTask} disabled={busy}>
              追加
            </button>
          </div>
          <div className="table-scroll scroll">
            <table className="task-table">
              <thead>
                <tr>
                  <th>
                    <span className="visually-hidden">完了</span>
                  </th>
                  <th className="col-prio">優先度</th>
                  <th>タスク</th>
                  <th className="col-time right">時間</th>
                  <th className="col-date right">作成日</th>
                </tr>
              </thead>
              <tbody ref={tableRef} tabIndex={0} onKeyDown={onTableKeyDown} aria-label="タスク一覧">
                {visible.length === 0 && (
                  <tr className="empty">
                    <td colSpan={5}>{query.trim() ? "見つかりませんでした" : "タスクがありません"}</td>
                  </tr>
                )}
                {visible.map((task) => {
                  const meta = PRIORITY_META[task.priority];
                  return (
                    <tr
                      key={task.id}
                      aria-selected={task.id === selectedId}
                      className={task.completed ? "completed" : undefined}
                      onClick={() => select(task)}
                    >
                      <td>
                        <input
                          type="checkbox"
                          className="check"
                          checked={task.completed}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => void toggleComplete(task)}
                          aria-label={task.completed ? `${task.name} を未完了に戻す` : `${task.name} を完了にする`}
                        />
                      </td>
                      <td>
                        <span className="prio-chip" style={{ color: meta.chipFg, background: meta.chipBg }}>
                          {meta.label}
                        </span>
                      </td>
                      <td>
                        <span className="cell-name ellipsis" title={task.name}>
                          {task.name}
                        </span>
                        {task.memo && (
                          <span className="cell-memo ellipsis" title={task.memo}>
                            {task.memo}
                          </span>
                        )}
                      </td>
                      <td className="right cell-time">{formatDuration(task.totalMinutes)}</td>
                      <td className="right cell-date">{formatDate(task.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="table-hint">↑↓ 選択 · Enter 編集 · Backspace 完了 · Delete 削除 · Esc 戻る</p>
        </section>

        <aside className="detail" aria-label="選択中のタスク">
          {selected && form ? (
            <>
              <label>
                タスク名
                <input
                  ref={nameRef}
                  className="field"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) void updateTask();
                  }}
                  aria-label="タスク名"
                />
              </label>

              <fieldset>
                <legend>優先度</legend>
                <div className="prio-picker">
                  {PRIORITIES.map((p: Priority) => {
                    const meta = PRIORITY_META[p];
                    const on = form.priority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        className="prio-option"
                        aria-pressed={on}
                        title={p}
                        style={on ? { borderColor: meta.dot, background: meta.chipBg, color: meta.chipFg } : undefined}
                        onClick={() => setForm({ ...form, priority: p })}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label>
                メモ
                <textarea
                  className="field"
                  rows={5}
                  value={form.memo}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void updateTask();
                  }}
                  aria-label="メモ"
                />
              </label>

              <dl className="stats">
                <div>
                  <dt>累計</dt>
                  <dd>{formatDuration(selected.totalMinutes, "0m")}</dd>
                </div>
                <div>
                  <dt>セッション</dt>
                  <dd>{selected.sessionCount}</dd>
                </div>
                <div title={formatFullDate(selected.createdAt)}>
                  <dt>作成日</dt>
                  <dd>{formatDate(selected.createdAt)}</dd>
                </div>
              </dl>

              <div className="detail-actions">
                <button type="button" className="btn btn-primary" onClick={updateTask} disabled={busy}>
                  変更を保存
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => void toggleComplete(selected)}
                  disabled={busy}
                >
                  {selected.completed ? "未完了に戻す" : "完了にする"}
                </button>
                <button type="button" className="btn btn-ghost-danger" onClick={removeTask} disabled={busy}>
                  <TrashIcon />
                  削除
                </button>
              </div>
            </>
          ) : (
            <p className="detail-empty">一覧からタスクを選ぶと、ここで編集できます</p>
          )}
        </aside>
      </div>
    </main>
  );
}
