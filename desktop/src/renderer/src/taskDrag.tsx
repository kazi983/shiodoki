/**
 * Drag and drop of task rows between and across priority headings (requirements M-19 on Android, the same rules on
 * desktop): the list is one flat sortable list of headings and tasks, so a task dropped under another heading
 * changes priority. While a row is dragged every heading is shown, so a task can go to a priority without tasks.
 */

import {
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, type CSSProperties, type ReactNode } from "react";
import type { Priority, TaskDrop } from "@shared/task";
import { dropOf, entriesOf, moved, type PriorityGroup, type TaskListEntry } from "@shared/taskList";
import { alertError } from "./errors";

/** Movement before a press becomes a drag; less is a click (the same as the overlay tab). */
const DRAG_THRESHOLD_PX = 4;

export interface TaskDrag {
  /** The lines to show: the drag preview while dragging, and the dropped order until the new tasks arrive. */
  entries: TaskListEntry[];
  /** The dragged task and the priority it would land in, for its color bar. */
  activeId: string | null;
  overPriority: Priority | null;
  /** For TaskDragContext. */
  context: {
    enabled: boolean;
    ids: string[];
    onDragStart(event: DragStartEvent): void;
    onDragOver(event: DragOverEvent): void;
    onDragEnd(event: DragEndEvent): void;
    onDragCancel(): void;
  };
}

/**
 * Drag state of one list showing `groups` (memoized: a new array means new tasks arrived). `onDrop` writes the
 * drop and resolves to whether anything changed. Nothing can be dragged while `enabled` is false.
 */
export function useTaskDrag(
  groups: readonly PriorityGroup[],
  onDrop: (drop: TaskDrop) => Promise<boolean>,
  enabled = true,
): TaskDrag {
  const [dragEntries, setDragEntries] = useState<TaskListEntry[] | null>(null);
  const [held, setHeld] = useState<TaskListEntry[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
  const [seenGroups, setSeenGroups] = useState(groups);

  // New tasks: show them instead of the dropped order. A dragged task completed or deleted elsewhere ends the drag.
  if (groups !== seenGroups) {
    setSeenGroups(groups);
    setHeld(null);
    if (activeId && !groups.some((g) => g.tasks.some((t) => t.id === activeId))) {
      setDragEntries(null);
      setActiveId(null);
    }
  }

  const entries = dragEntries ?? held ?? entriesOf(groups, false);
  const indexOf = (id: UniqueIdentifier | null) => entries.findIndex((e) => e.key === id);
  const preview = activeId && overId !== null ? moved(entries, indexOf(activeId), indexOf(overId)) : entries;
  const overPriority = activeId ? (dropOf(preview, activeId)?.priority ?? null) : null;

  function clear() {
    setDragEntries(null);
    setActiveId(null);
    setOverId(null);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const current = dragEntries;
    clear();
    if (!current || !over) return;
    const next = moved(current, indexOf(active.id), Math.max(1, indexOf(over.id)));
    const drop = dropOf(next, String(active.id));
    if (!drop) return;
    // Keep the dropped order until the tasks reload, so the row does not jump back for a moment.
    setHeld(next);
    onDrop(drop)
      .then((wrote) => {
        if (!wrote) setHeld(null);
      })
      .catch(async (error: unknown) => {
        setHeld(null);
        await alertError(error);
      });
  }

  return {
    entries,
    activeId,
    overPriority,
    context: {
      enabled,
      ids: entries.map((e) => e.key),
      onDragStart: ({ active }) => {
        setDragEntries(entriesOf(groups, true));
        setActiveId(String(active.id));
        setOverId(active.id);
      },
      onDragOver: ({ over }) => setOverId(over?.id ?? null),
      onDragEnd,
      onDragCancel: clear,
    },
  };
}

/** Wraps a list that uses `useTaskDrag`; its lines use `useSortableLine`. */
export function TaskDragContext({ drag, children }: { drag: TaskDrag; children: ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_THRESHOLD_PX } }));
  const { enabled, ids, ...handlers } = drag.context;
  return (
    <DndContext
      sensors={enabled ? sensors : []}
      collisionDetection={closestCenter}
      // Headings appear when the drag starts; measure them as they do.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      {...handlers}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * Props for a sortable line: `ref`, the drag listeners and the moving style. A heading cannot be dragged, and the
 * first one cannot be dropped on (nothing goes above it).
 */
export function useSortableLine(entry: TaskListEntry, first: boolean) {
  const heading = entry.kind === "heading";
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: entry.key,
    disabled: { draggable: heading, droppable: heading && first },
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 2 : undefined,
  };
  return { ref: setNodeRef, listeners: heading ? undefined : listeners, style, isDragging };
}
