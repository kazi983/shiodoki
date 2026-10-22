import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { t } from "@shared/i18n";
import { PRIORITIES, PRIORITY_META, formatDuration, type Priority, type Task } from "@shared/task";
import { groupTasks, stepDrop, type TaskListEntry } from "@shared/taskList";
import { alertError } from "../errors";
import { BackIcon, SearchIcon, TrashIcon } from "../icons";
import { SyncBadge } from "../SyncBadge";
import { TaskDragContext, useSortableLine, useTaskDrag, type TaskDrag } from "../taskDrag";
import { useTaskDraft } from "../useTaskDraft";

function matches(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || task.name.toLowerCase().includes(q) || task.memo.toLowerCase().includes(q);
}

/** Completed rows: newest first within each priority, like the completed list on Android. */
function byCompletedDesc(a: Task, b: Task): number {
  return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
}

/** Add / edit / complete / delete tasks: list on the left, the selected task on the right. */
export function ManagementPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  // Open tasks and, below them, completed ones, each under priority headings. A drag moves an open task (and
  // changes its priority under another heading); a completed one only changes priority. Not while searching, when
  // only some rows are shown.
  const searching = query.trim() !== "";
  const openGroups = useMemo(() => groupTasks(tasks.filter((t) => !t.completed && matches(t, query))), [tasks, query]);
  const doneGroups = useMemo(
    () => groupTasks(tasks.filter((t) => showCompleted && t.completed && matches(t, query)).sort(byCompletedDesc)),
    [tasks, query, showCompleted],
  );
  const openDrag = useTaskDrag(openGroups, (drop) => window.api.tasks.move(drop, true), !searching);
  const doneDrag = useTaskDrag(doneGroups, (drop) => window.api.tasks.move(drop, false), !searching);
  const visible = [...openDrag.entries, ...doneDrag.entries].flatMap((e) => (e.kind === "task" ? [e.task] : []));
  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const draft = useTaskDraft(selected);
  const form = draft.form;
  const { leave } = draft;
  const statusText = { idle: "", pending: text.unsavedChanges, saved: text.saved, failed: text.saveFailed };

  const backToPicker = useCallback(async () => {
    await leave();
    await window.api.nav.openPicker();
  }, [leave]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) void backToPicker();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [backToPicker]);
  const openCount = tasks.filter((t) => !t.completed).length;
  const doneCount = tasks.length - openCount;

  useEffect(() => {
    tableRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function select(task: Task | null) {
    if ((task?.id ?? null) === selectedId) return;
    void draft.leave();
    setSelectedId(task?.id ?? null);
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

  const toggleComplete = (task: Task | null) =>
    run(async () => {
      if (!task) return;
      if (task.id === selectedId) await draft.flush();
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
      draft.cancel();
      await window.api.tasks.remove(selected.id);
      select(null);
    });

  /** Alt+↑/↓: the selected task one line up or down, into the next priority past a heading. */
  const moveSelected = (step: -1 | 1) =>
    run(async () => {
      if (!selected || searching) return;
      const drop = stepDrop(selected.completed ? doneGroups : openGroups, selected.id, step);
      if (drop) await window.api.tasks.move(drop, !selected.completed);
    });

  function onTableKeyDown(e: KeyboardEvent<HTMLTableSectionElement>) {
    const index = visible.findIndex((t) => t.id === selectedId);
    if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      void moveSelected(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
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
          onClick={() => void backToPicker()}
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
                <TaskDragContext drag={openDrag}>
                  <ManagementLines
                    drag={openDrag}
                    selectedId={selectedId}
                    onSelect={select}
                    onToggle={toggleComplete}
                  />
                </TaskDragContext>
                {doneDrag.entries.length > 0 && (
                  <tr className="section-row">
                    <td colSpan={5}>{text.completedSection}</td>
                  </tr>
                )}
                <TaskDragContext drag={doneDrag}>
                  <ManagementLines
                    drag={doneDrag}
                    selectedId={selectedId}
                    onSelect={select}
                    onToggle={toggleComplete}
                  />
                </TaskDragContext>
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
                  onChange={(e) => draft.edit({ name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) void draft.flush();
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
                        onClick={() => {
                          draft.edit({ priority: p });
                          void draft.flush();
                        }}
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
                  onChange={(e) => draft.edit({ memo: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void draft.flush();
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
                <p
                  className={draft.error || draft.status === "failed" ? "save-status error" : "save-status"}
                  role="status"
                >
                  {draft.error ?? statusText[draft.status]}
                </p>
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

/** The lines of one TaskDragContext: priority headings and task rows. */
function ManagementLines({
  drag,
  selectedId,
  onSelect,
  onToggle,
}: {
  drag: TaskDrag;
  selectedId: string | null;
  onSelect: (task: Task) => void;
  onToggle: (task: Task) => void;
}) {
  return drag.entries.map((entry, index) => (
    <ManagementLine
      key={entry.key}
      entry={entry}
      first={index === 0}
      selected={entry.key === selectedId}
      dropPriority={entry.key === drag.activeId ? drag.overPriority : null}
      onSelect={onSelect}
      onToggle={onToggle}
    />
  ));
}

function ManagementLine({
  entry,
  first,
  selected,
  dropPriority,
  onSelect,
  onToggle,
}: {
  entry: TaskListEntry;
  first: boolean;
  selected: boolean;
  /** While dragged: the priority it would land in, shown as a color bar. */
  dropPriority: Priority | null;
  onSelect: (task: Task) => void;
  onToggle: (task: Task) => void;
}) {
  const { priority, management: text, picker } = t();
  const { ref, listeners, style, isDragging } = useSortableLine(entry, first);
  if (entry.kind === "heading") {
    return (
      <tr ref={ref} style={style} className="group-row">
        <td colSpan={5}>
          <span className="group-label">
            <span className="group-dot" style={{ background: PRIORITY_META[entry.priority].dot }} />
            {PRIORITY_META[entry.priority].shortName}
            {picker.showPriorityLabel && <span className="jp">{priority[entry.priority]}</span>}
          </span>
        </td>
      </tr>
    );
  }
  const { task } = entry;
  const meta = PRIORITY_META[task.priority];
  const classes = [task.completed && "completed", isDragging && "dragging"].filter(Boolean).join(" ");
  return (
    <tr
      ref={ref}
      style={
        dropPriority ? { ...style, boxShadow: `inset 4px 0 0 ${PRIORITY_META[dropPriority].dot}, var(--lift)` } : style
      }
      aria-selected={selected}
      className={classes || undefined}
      onClick={() => onSelect(task)}
      {...listeners}
    >
      <td>
        <input
          type="checkbox"
          className="check"
          checked={task.completed}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggle(task)}
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
}
