import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { t } from "@shared/i18n";
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
  const { common, priority, management: text } = t();

  const load = useCallback(async () => {
    setTasks(await window.api.tasks.listAll());
  }, []);

  useEffect(() => {
    document.title = t().common.manageTasks;
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
        await window.api.dialog.alert(text.emptyNameTitle, text.emptyNameMessage);
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
      if (selected.name !== form.name.trim()) changes.push(text.changeName(selected.name, form.name.trim()));
      if (selected.priority !== form.priority)
        changes.push(text.changePriority(priority[selected.priority], priority[form.priority]));
      if (selected.memo !== form.memo.trim()) changes.push(text.changeMemo);
      if (changes.length === 0) {
        await window.api.dialog.alert(text.noChangesTitle, text.noChangesMessage);
        return;
      }
      if (!(await window.api.dialog.confirm(text.updateTitle, text.updateConfirm(changes.join("\n"))))) return;
      const updated = await window.api.tasks.update(selected.id, form);
      select(updated);
    });

  const toggleComplete = (task: Task | null) =>
    run(async () => {
      if (!task) return;
      if (task.completed) {
        if (!(await window.api.dialog.confirm(text.reopenTitle, text.reopenConfirm(task.name)))) return;
        await window.api.tasks.reopen(task.id);
      } else {
        if (!(await window.api.dialog.confirm(text.completeTitle, text.completeConfirm(task.name)))) return;
        await window.api.tasks.complete(task.id);
      }
    });

  const removeTask = () =>
    run(async () => {
      if (!selected) return;
      if (!(await window.api.dialog.confirm(text.deleteTitle, text.deleteConfirm(selected.name)))) return;
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
          aria-label={text.back}
          title={text.backTitle}
        >
          <BackIcon />
        </button>
        <div className="management-title">
          <h1>{common.manageTasks}</h1>
          <p className="sub">{text.counts(openCount, doneCount)}</p>
        </div>
        <div className="header-tools">
          <label className="search">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={text.search}
              aria-label={text.search}
            />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
            {text.showCompleted}
          </label>
          <SyncBadge />
        </div>
      </header>

      <div className="management-body">
        <section className="table-card" aria-label={common.taskList}>
          <div className="table-add">
            <input
              ref={addRef}
              className="field"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void addTask();
              }}
              placeholder={common.newTaskPlaceholder}
              aria-label={common.newTask}
            />
            <button type="button" className="btn btn-primary" onClick={addTask} disabled={busy}>
              {text.add}
            </button>
          </div>
          <div className="table-scroll scroll">
            <table className="task-table">
              <thead>
                <tr>
                  <th>
                    <span className="visually-hidden">{text.colDone}</span>
                  </th>
                  <th className="col-prio">{text.colPriority}</th>
                  <th>{text.colTask}</th>
                  <th className="col-time right">{text.colTime}</th>
                  <th className="col-date right">{text.colCreated}</th>
                </tr>
              </thead>
              <tbody ref={tableRef} tabIndex={0} onKeyDown={onTableKeyDown} aria-label={common.taskList}>
                {visible.length === 0 && (
                  <tr className="empty">
                    <td colSpan={5}>{query.trim() ? text.noMatches : text.noTasks}</td>
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
                          aria-label={task.completed ? text.reopenAria(task.name) : text.completeAria(task.name)}
                        />
                      </td>
                      <td>
                        <span className="prio-chip" style={{ color: meta.chipFg, background: meta.chipBg }}>
                          {priority[task.priority]}
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
                      <td className="right cell-date">{t().dates.short(new Date(task.createdAt))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="table-hint">{text.keyHint}</p>
        </section>

        <aside className="detail" aria-label={text.selectedTask}>
          {selected && form ? (
            <>
              <label>
                {text.name}
                <input
                  ref={nameRef}
                  className="field"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) void updateTask();
                  }}
                  aria-label={text.name}
                />
              </label>

              <fieldset>
                <legend>{text.priority}</legend>
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
                        title={meta.shortName}
                        style={on ? { borderColor: meta.dot, background: meta.chipBg, color: meta.chipFg } : undefined}
                        onClick={() => setForm({ ...form, priority: p })}
                      >
                        {priority[p]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label>
                {text.memo}
                <textarea
                  className="field"
                  rows={5}
                  value={form.memo}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void updateTask();
                  }}
                  aria-label={text.memo}
                />
              </label>

              <dl className="stats">
                <div>
                  <dt>{text.total}</dt>
                  <dd>{formatDuration(selected.totalMinutes, "0m")}</dd>
                </div>
                <div>
                  <dt>{common.sessions}</dt>
                  <dd>{selected.sessionCount}</dd>
                </div>
                <div title={t().dates.full(new Date(selected.createdAt))}>
                  <dt>{text.created}</dt>
                  <dd>{t().dates.short(new Date(selected.createdAt))}</dd>
                </div>
              </dl>

              <div className="detail-actions">
                <button type="button" className="btn btn-primary" onClick={updateTask} disabled={busy}>
                  {text.save}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => void toggleComplete(selected)}
                  disabled={busy}
                >
                  {selected.completed ? text.reopen : text.complete}
                </button>
                <button type="button" className="btn btn-ghost-danger" onClick={removeTask} disabled={busy}>
                  <TrashIcon />
                  {text.delete}
                </button>
              </div>
            </>
          ) : (
            <p className="detail-empty">{text.detailEmpty}</p>
          )}
        </aside>
      </div>
    </main>
  );
}
