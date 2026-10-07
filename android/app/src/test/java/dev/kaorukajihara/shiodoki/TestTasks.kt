package dev.kaorukajihara.shiodoki

import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.Task
import java.time.Instant

fun task(
  id: String,
  name: String = id,
  priority: Priority = Priority.NOW,
  memo: String = "",
  createdAt: String = "2026-01-01T00:00:00Z",
  completed: Boolean = false,
  deleted: Boolean = false,
) = Task(
  id = id,
  name = name,
  memo = memo,
  priority = priority,
  completed = completed,
  completedAt = null,
  deleted = deleted,
  totalMinutes = 0,
  sessionCount = 0,
  createdAt = Instant.parse(createdAt),
  updatedAt = Instant.parse(createdAt),
)
