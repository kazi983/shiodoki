import { randomUUID } from "node:crypto";
import { t } from "@shared/i18n";
import { startOfWorkDay, summarizeSessions, type DaySummary, type SessionRecord } from "@shared/session";
import {
  compareTasks,
  compareTasksForManagement,
  endSortOrder,
  normalizeTaskInput,
  type Task,
  type TaskInput,
  type TaskPatch,
} from "@shared/task";
import type { Preferences, TaskRepository } from "./taskRepository";

const INPUT_FIELDS = ["name", "priority", "memo"] as const;

/**
 * Task use cases. Every mutation notifies `onChanged` so open windows
 * can refresh.
 */
export class TaskService {
  constructor(
    private readonly repo: TaskRepository,
    private readonly onChanged: () => void = () => {},
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listIncomplete(): Promise<Task[]> {
    const tasks = await this.repo.listTasks();
    return tasks.filter((t) => !t.deleted && !t.completed).sort(compareTasks);
  }

  async listAll(): Promise<Task[]> {
    const tasks = await this.repo.listTasks();
    return tasks.filter((t) => !t.deleted).sort(compareTasksForManagement);
  }

  async get(id: string): Promise<Task> {
    const task = await this.repo.getTask(id);
    if (!task || task.deleted) throw new Error(t().errors.taskNotFound);
    return task;
  }

  async add(input: TaskInput): Promise<Task> {
    const v = normalizeTaskInput(input);
    const date = this.now();
    const now = date.toISOString();
    const task: Task = {
      id: randomUUID(),
      name: v.name,
      memo: v.memo,
      priority: v.priority,
      completed: false,
      completedAt: null,
      deleted: false,
      totalMinutes: 0,
      sessionCount: 0,
      createdAt: now,
      updatedAt: now,
      updatedBy: "desktop",
      // New tasks go to the end of their priority (requirements §5.5).
      sortOrder: endSortOrder(await this.repo.listTasks(), v.priority, date),
    };
    await this.repo.createTask(task);
    this.onChanged();
    return task;
  }

  /** Write only the given fields, validated together with the stored values of the others. */
  async update(id: string, patch: Partial<TaskInput>): Promise<Task> {
    const current = await this.get(id);
    const v = normalizeTaskInput({ name: current.name, priority: current.priority, memo: current.memo, ...patch });
    const fields = INPUT_FIELDS.filter((field) => patch[field] !== undefined);
    if (fields.length === 0) return current;
    const write = Object.fromEntries(fields.map((field) => [field, v[field]])) as TaskPatch;
    // A task moved to another priority goes to the end of it (requirements §5.5).
    if (v.priority !== current.priority) {
      write.sortOrder = endSortOrder(await this.repo.listTasks(), v.priority, this.now(), id);
    }
    await this.repo.updateTask(id, write);
    this.onChanged();
    return this.get(id);
  }

  async complete(id: string): Promise<void> {
    await this.get(id);
    await this.repo.updateTask(id, { completed: true, completedAt: this.now().toISOString() });
    this.onChanged();
  }

  async reopen(id: string): Promise<void> {
    await this.get(id);
    await this.repo.updateTask(id, { completed: false, completedAt: null });
    this.onChanged();
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    await this.repo.updateTask(id, { deleted: true });
    this.onChanged();
  }

  async recordSession(session: SessionRecord | null): Promise<void> {
    if (!session) return;
    await this.repo.recordSession(session);
    this.onChanged();
  }

  /** Time worked per task since the start of the work day. */
  async todaySummary(): Promise<DaySummary> {
    return summarizeSessions(await this.repo.listSessionsSince(startOfWorkDay(this.now())));
  }

  async getPreferences(): Promise<Preferences> {
    return this.repo.getPreferences();
  }

  async markLastSelected(id: string): Promise<void> {
    await this.repo.setPreferences({ lastSelectedTaskId: id });
  }
}
