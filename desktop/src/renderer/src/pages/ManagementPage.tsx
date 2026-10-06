import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  DEFAULT_PRIORITY,
  PRIORITIES,
  PRIORITY_META,
  formatMinutes,
  type Priority,
  type Task,
  type TaskInput,
} from "@shared/task";
import { alertError } from "../errors";
import { SyncBadge } from "../SyncBadge";

const EMPTY_FORM: TaskInput = { name: "", priority: DEFAULT_PRIORITY, memo: "" };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Add / edit / complete / delete tasks. */
export function ManagementPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskInput>(EMPTY_FORM);
  const [showCompleted, setShowCompleted] = useState(true);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  const load = useCallback(async () => {
    setTasks(await window.api.tasks.listAll());
  }, []);

  useEffect(() => {
    document.title = "タスク管理";
    void load();
    nameRef.current?.focus();
    return window.api.tasks.onChanged(() => void load());
  }, [load]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) void window.api.nav.openPicker();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = showCompleted ? tasks : tasks.filter((t) => !t.completed);
  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    tableRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function select(task: Task | null) {
    setSelectedId(task?.id ?? null);
    setForm(task ? { name: task.name, priority: task.priority, memo: task.memo } : EMPTY_FORM);
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
      if (!form.name.trim()) {
        await window.api.dialog.alert("未入力", "タスクを入力してください");
        return;
      }
      await window.api.tasks.add(form);
      // Keep the form empty and unselected so Enter adds the next task.
      select(null);
      nameRef.current?.focus();
    });

  const updateTask = () =>
    run(async () => {
      if (!selected) {
        await window.api.dialog.alert("未選択", "更新するタスクを選んでください");
        return;
      }
      const changes: string[] = [];
      if (selected.name !== form.name.trim()) changes.push(`タスク: ${selected.name} ➤ ${form.name.trim()}`);
      if (selected.priority !== form.priority) changes.push(`優先度: ${selected.priority} ➤ ${form.priority}`);
      if (selected.memo !== form.memo.trim()) changes.push("メモを変更");
      if (changes.length === 0) {
        await window.api.dialog.alert("変更なし", "変更内容を入力してください");
        return;
      }
      if (!(await window.api.dialog.confirm("更新", `更新しますか？\n\n${changes.join("\n")}`))) return;
      const updated = await window.api.tasks.update(selected.id, form);
      select(updated);
    });

  const toggleComplete = () =>
    run(async () => {
      if (!selected) return;
      if (selected.completed) {
        if (!(await window.api.dialog.confirm("未完了に戻す", `${selected.name} を未完了に戻しますか？`))) return;
        await window.api.tasks.reopen(selected.id);
      } else {
        if (!(await window.api.dialog.confirm("タスク完了", `${selected.name} を完了済みタスクに登録しますか？`)))
          return;
        await window.api.tasks.complete(selected.id);
      }
    });

  const removeTask = () =>
    run(async () => {
      if (!selected) return;
      if (!(await window.api.dialog.confirm("タスク削除", `${selected.name} を削除しますか？`))) return;
      await window.api.tasks.remove(selected.id);
      select(null);
    });

  const exitApp = () =>
    run(async () => {
      if (await window.api.dialog.confirm("終了", "アプリを終了しますか？")) await window.api.nav.exit();
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
      void toggleComplete();
    } else if (e.key === "Delete") {
      e.preventDefault();
      void removeTask();
    }
  }

  const onFormEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void (selected ? updateTask() : addTask());
    }
  };

  return (
    <main className="management">
      <header className="management-header">
        <div>
          <h1>タスク管理</h1>
          <p className="sub">タスクの追加・編集・整理</p>
        </div>
        <div className="header-right">
          <SyncBadge tone="light" />
          <label className="toggle">
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
            完了済みも表示
          </label>
        </div>
      </header>

      <div className="table-card">
        <table className="task-table">
          <colgroup>
            <col className="col-check" />
            <col className="col-prio" />
            <col className="col-name" />
            <col className="col-memo" />
            <col className="col-time" />
            <col className="col-date" />
          </colgroup>
          <thead>
            <tr>
              <th>✓</th>
              <th>優先度</th>
              <th>タスク</th>
              <th>メモ</th>
              <th>時間</th>
              <th>作成日</th>
            </tr>
          </thead>
          <tbody ref={tableRef} tabIndex={0} onKeyDown={onTableKeyDown} aria-label="タスク一覧">
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  タスクがありません
                </td>
              </tr>
            )}
            {visible.map((task) => (
              <tr
                key={task.id}
                aria-selected={task.id === selectedId}
                className={task.completed ? "completed" : undefined}
                style={{ background: task.id === selectedId ? undefined : PRIORITY_META[task.priority].color }}
                onClick={() => select(task)}
              >
                <td className="center">{task.completed ? "✓" : ""}</td>
                <td className="center">
                  {PRIORITY_META[task.priority].icon} {task.priority}
                </td>
                <td className="ellipsis" title={task.name}>
                  {task.name}
                </td>
                <td className="ellipsis" title={task.memo}>
                  {task.memo}
                </td>
                <td className="right">{formatMinutes(task.totalMinutes)}</td>
                <td className="center">{formatDate(task.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="form-card">
        <input
          ref={nameRef}
          className="input input-light form-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          onKeyDown={onFormEnter}
          placeholder="タスク名"
          aria-label="タスク名"
        />
        <select
          className="input input-light"
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
          aria-label="優先度"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_META[p].icon} {p}（{PRIORITY_META[p].label}）
            </option>
          ))}
        </select>
        <input
          className="input input-light form-memo"
          value={form.memo}
          onChange={(e) => setForm({ ...form, memo: e.target.value })}
          onKeyDown={onFormEnter}
          placeholder="メモ"
          aria-label="メモ"
        />
        {selected && (
          <button className="btn btn-link" onClick={() => select(null)}>
            選択解除
          </button>
        )}
      </section>

      <footer className="management-actions">
        <button className="btn btn-accent" onClick={addTask} disabled={busy}>
          ＋ 新規登録
        </button>
        <div className="right-actions">
          <button className="btn btn-success" onClick={toggleComplete} disabled={!selected || busy}>
            {selected?.completed ? "未完了に戻す" : "完了"}
          </button>
          <button className="btn btn-danger" onClick={removeTask} disabled={!selected || busy}>
            削除
          </button>
          <button className="btn btn-neutral" onClick={updateTask} disabled={!selected || busy}>
            更新
          </button>
          <button className="btn btn-neutral" onClick={() => void window.api.nav.openPicker()}>
            戻る
          </button>
          <button className="btn btn-danger" onClick={exitApp}>
            終了
          </button>
        </div>
      </footer>
    </main>
  );
}
