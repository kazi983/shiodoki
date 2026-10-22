package dev.kaorukajihara.shiodoki.ui.components

import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.TaskDrop
import dev.kaorukajihara.shiodoki.task
import dev.kaorukajihara.shiodoki.ui.home.PriorityGroup
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TaskListEntryTest {
  private val groups = listOf(
    PriorityGroup(Priority.NOW, listOf(task("n1"), task("n2"))),
    PriorityGroup(Priority.SOMEDAY, listOf(task("s1", priority = Priority.SOMEDAY))),
  )

  private fun List<TaskListEntry>.keys() = map { it.key }

  @Test
  fun `headings of the groups with their tasks`() {
    assertEquals(
      listOf("heading:NOW", "n1", "n2", "heading:SOMEDAY", "s1"),
      entriesOf(groups, allHeadings = false).keys(),
    )
  }

  @Test
  fun `while dragging every priority has a heading`() {
    assertEquals(
      listOf(
        "heading:NOW", "n1", "n2", "heading:ROUTINE", "heading:SOONER", "heading:ANYTIME",
        "heading:SOMEDAY", "s1", "heading:BREAK",
      ),
      entriesOf(groups, allHeadings = true).keys(),
    )
  }

  @Test
  fun `a row moved past a heading lands under it`() {
    val entries = entriesOf(groups, allHeadings = true)
    // n2 dragged onto the ROUTINE heading: the heading moves up, n2 is first under it.
    val moved = entries.moved(2, 3)
    assertEquals(listOf("heading:NOW", "n1", "heading:ROUTINE", "n2"), moved.keys().take(4))
    assertEquals(TaskDrop("n2", Priority.ROUTINE, listOf("n2")), moved.dropOf("n2"))
    assertEquals(TaskDrop("n1", Priority.NOW, listOf("n1")), moved.dropOf("n1"))
  }

  @Test
  fun `nothing goes above the first heading`() {
    val entries = entriesOf(groups, allHeadings = false)
    assertEquals(entries, entries.moved(1, 0))
    assertEquals(entries, entries.moved(1, 9))
  }

  @Test
  fun `a drop lists the rows under the same heading`() {
    val entries = entriesOf(groups, allHeadings = false).moved(1, 2)
    assertEquals(TaskDrop("n1", Priority.NOW, listOf("n2", "n1")), entries.dropOf("n1"))
    assertEquals(TaskDrop("s1", Priority.SOMEDAY, listOf("s1")), entries.dropOf("s1"))
    assertNull(entries.dropOf("missing"))
  }
}
