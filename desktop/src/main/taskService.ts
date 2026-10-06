import { randomUUID } from "node:crypto";
import type { SessionRecord } from "@shared/session";
import {
  compareTasks,
  compareTasksForManagement,
  normalizeTaskInput,
  type Task,
  type TaskInput,
} from "@shared/task";
import type { Preferences, TaskRepository } from "./taskRepository";

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
    if (!task || task.deleted) throw new Error("タスクが見つかりません");
    return task;
  }

  async add(input: TaskInput): Promise<Task> {
    const v = normalizeTaskInput(input);
    const now = this.now().toISOString();
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
    };
    await this.repo.putTask(task);
    this.onChanged();
    return task;
  }

  async update(id: string, input: TaskInput): Promise<Task> {
    const v = normalizeTaskInput(input);
    const task = await this.get(id);
    const updated = { ...task, ...v, ...this.stamp() };
    await this.repo.putTask(updated);
    this.onChanged();
    return updated;
  }

  async complete(id: string): Promise<void> {
    const task = await this.get(id);
    await this.repo.putTask({ ...task, completed: true, completedAt: this.now().toISOString(), ...this.stamp() });
    this.onChanged();
  }

  async reopen(id: string): Promise<void> {
    const task = await this.get(id);
    await this.repo.putTask({ ...task, completed: false, completedAt: null, ...this.stamp() });
    this.onChanged();
  }

  async remove(id: string): Promise<void> {
    const task = await this.get(id);
    await this.repo.putTask({ ...task, deleted: true, ...this.stamp() });
    this.onChanged();
  }

  async recordSession(session: SessionRecord | null): Promise<void> {
    if (!session) return;
    await this.repo.recordSession(session, this.now().toISOString());
    this.onChanged();
  }

  async getPreferences(): Promise<Preferences> {
    return this.repo.getPreferences();
  }

  async markLastSelected(id: string): Promise<void> {
    await this.repo.setPreferences({ lastSelectedTaskId: id });
  }

  private stamp(): Pick<Task, "updatedAt" | "updatedBy"> {
    return { updatedAt: this.now().toISOString(), updatedBy: "desktop" };
  }
}
