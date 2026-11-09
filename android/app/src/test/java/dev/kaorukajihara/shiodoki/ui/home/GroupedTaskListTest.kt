package dev.kaorukajihara.shiodoki.ui.home

import android.app.Application
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.unit.dp
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.TaskDrop
import dev.kaorukajihara.shiodoki.task
import dev.kaorukajihara.shiodoki.ui.components.SwipeToComplete
import dev.kaorukajihara.shiodoki.ui.shortName
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The drag of [GroupedTaskList] with real touch input (design §5.3). A plain Application, so Firebase is not
 * started. The list is 500dp high; rows are about 56dp.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], application = Application::class)
class GroupedTaskListTest {
  @get:Rule val rule = createComposeRule()

  private val drops = mutableListOf<TaskDrop>()
  private val clicks = mutableListOf<String>()
  private val completed = mutableListOf<String>()

  private fun show(groups: List<PriorityGroup>) = rule.setContent { TestList(groups) }

  @Composable
  private fun TestList(groups: List<PriorityGroup>, revealTaskId: String? = null) {
    Box(Modifier.height(500.dp).fillMaxWidth()) {
      GroupedTaskList(
        groups,
        onMove = { drops += it; true },
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(0.dp),
        revealTaskId = revealTaskId,
      ) { task ->
        SwipeToComplete(onComplete = { completed += task.id }, modifier = Modifier) {
          TaskRow(task, detail = "", onClick = { clicks += task.id })
        }
      }
    }
  }

  private fun manyTasks(priority: Priority = Priority.NOW) = (1..40).map {
    task("t%02d".format(it), priority = priority, createdAt = "2026-01-01T00:00:%02dZ".format(it))
  }

  /** Long press on [name], then [steps] moves of [dy] pixels, without lifting the finger. */
  private fun pressAndDrag(name: String, steps: Int, dy: Float) = rule.onNodeWithText(name).performTouchInput {
    down(center)
    advanceEventTime(800)
    repeat(steps) {
      moveBy(Offset(0f, dy))
      advanceEventTime(16)
    }
  }

  /** Lifts the finger after the list has caught up with the last move. */
  private fun release(name: String) {
    rule.mainClock.advanceTimeBy(500)
    rule.onNodeWithText(name).performTouchInput { up() }
    rule.mainClock.advanceTimeBy(2000)
  }

  @Test
  fun `a short move swaps with the neighbor`() {
    show(listOf(PriorityGroup(Priority.NOW, listOf(task("n1"), task("n2"), task("n3")))))
    pressAndDrag("n1", steps = 5, dy = 14f)
    release("n1")
    assertEquals(listOf(TaskDrop("n1", Priority.NOW, listOf("n2", "n1", "n3"))), drops)
  }

  @Test
  fun `a row dragged past headings lands in that priority, and empty headings go away after the drop`() {
    show(listOf(PriorityGroup(Priority.NOW, listOf(task("n1"), task("n2"), task("n3")))))
    pressAndDrag("n1", steps = 18, dy = 15f)
    // Every heading is shown while dragging (ROUTINE is the first one without tasks).
    rule.onNodeWithText("ROUTINE").assertExists()
    release("n1")
    // Which empty heading it lands under depends on pixel sizes; any one past ROUTINE will do.
    val drop = drops.single()
    assertEquals(listOf("n1"), drop.orderedIds)
    assertTrue(drop.priority.ordinal > Priority.ROUTINE.ordinal)
    // The release after a drag is not a tap.
    assertEquals(emptyList<String>(), clicks)
    rule.onNodeWithText("ROUTINE").assertDoesNotExist()
    rule.onNodeWithText(drop.priority.shortName).assertIsDisplayed()
  }

  @Test
  fun `a tap is still a click`() {
    show(listOf(PriorityGroup(Priority.NOW, listOf(task("n1"), task("n2")))))
    rule.onNodeWithText("n1").performTouchInput {
      down(center)
      advanceEventTime(50)
      up()
    }
    rule.mainClock.advanceTimeBy(1000)
    assertEquals(listOf("n1"), clicks)
    assertEquals(emptyList<TaskDrop>(), drops)
  }

  @Test
  fun `holding a row at the bottom edge scrolls to the end`() {
    show(listOf(PriorityGroup(Priority.NOW, manyTasks())))
    pressAndDrag("t01", steps = 40, dy = 30f)
    rule.mainClock.advanceTimeBy(5000)
    rule.onNodeWithText("t40").assertIsDisplayed()
    release("t01")
    // Below the last row there are only the empty headings, so it lands under the last one.
    assertEquals(TaskDrop("t01", Priority.BREAK, listOf("t01")), drops.single())
  }

  @Test
  fun `holding a row at the top edge scrolls back to the start`() {
    show(listOf(PriorityGroup(Priority.SOMEDAY, manyTasks(Priority.SOMEDAY))))
    rule.onNode(hasScrollAction()).performScrollToNode(hasText("t40"))
    pressAndDrag("t40", steps = 40, dy = -30f)
    rule.mainClock.advanceTimeBy(5000)
    release("t40")
    // At the very top it lands under the first heading, the only place above the SOMEDAY rows.
    assertEquals(TaskDrop("t40", Priority.NOW, listOf("t40")), drops.single())
  }

  @Test
  fun `a swipe still completes, and a dragged row is not swiped`() {
    show(listOf(PriorityGroup(Priority.NOW, listOf(task("n1"), task("n2"), task("n3")))))
    rule.onNodeWithText("n1").performTouchInput { swipeRight(startX = centerX, endX = right * 3, durationMillis = 300) }
    rule.mainClock.advanceTimeBy(2000)
    rule.onNodeWithText("n2").performTouchInput {
      down(center)
      advanceEventTime(800)
      repeat(10) {
        moveBy(Offset(40f, 10f))
        advanceEventTime(16)
      }
      up()
    }
    rule.mainClock.advanceTimeBy(2000)
    assertEquals(listOf("n1"), completed)
    assertEquals(1, drops.size)
  }

  @Test
  fun `scrolling does not start a drag`() {
    show(listOf(PriorityGroup(Priority.NOW, manyTasks())))
    rule.onNodeWithText("t03").performTouchInput {
      down(center)
      repeat(30) {
        moveBy(Offset(0f, -20f))
        advanceEventTime(50)
      }
      up()
    }
    rule.mainClock.advanceTimeBy(2000)
    assertEquals(emptyList<TaskDrop>(), drops)
    rule.onNodeWithText("t15").assertIsDisplayed()
  }

  /** The vertical middle of [name]'s row, in dp from the top of the 500dp list. */
  private fun middleOf(name: String): Float {
    val bounds = rule.onNodeWithText(name).fetchSemanticsNode().boundsInRoot
    return with(rule.density) { ((bounds.top + bounds.bottom) / 2).toDp().value }
  }

  @Test
  fun `a task added below the fold is scrolled to the middle once it shows up`() {
    var groups by mutableStateOf(listOf(PriorityGroup(Priority.NOW, manyTasks())))
    var revealTaskId by mutableStateOf<String?>(null)
    rule.setContent { TestList(groups, revealTaskId) }
    rule.onNodeWithText("t01").assertIsDisplayed()
    // The id is known right after the add; the task itself arrives with a later snapshot.
    revealTaskId = "new"
    rule.mainClock.advanceTimeBy(1000)
    rule.onNodeWithText("t01").assertIsDisplayed()
    val tasks = manyTasks()
    groups = listOf(PriorityGroup(Priority.NOW, tasks.take(30) + task("new") + tasks.drop(30)))
    rule.mainClock.advanceTimeBy(3000)
    rule.onNodeWithText("t01").assertDoesNotExist()
    assertEquals(250f, middleOf("new"), 2f)
  }

  @Test
  fun `a task already in view is scrolled to the middle`() {
    var revealTaskId by mutableStateOf<String?>(null)
    rule.setContent { TestList(listOf(PriorityGroup(Priority.NOW, manyTasks())), revealTaskId) }
    rule.onNodeWithText("t07").assertIsDisplayed()
    revealTaskId = "t07"
    rule.mainClock.advanceTimeBy(3000)
    assertEquals(250f, middleOf("t07"), 2f)
  }

  @Test
  fun `a task near the top stays where it is`() {
    var revealTaskId by mutableStateOf<String?>(null)
    rule.setContent { TestList(listOf(PriorityGroup(Priority.NOW, manyTasks())), revealTaskId) }
    revealTaskId = "t02"
    rule.mainClock.advanceTimeBy(2000)
    rule.onNodeWithText("NOW").assertIsDisplayed()
    rule.onNodeWithText("t01").assertIsDisplayed()
  }

  @Test
  fun `the last task is scrolled to the end of the list`() {
    var revealTaskId by mutableStateOf<String?>(null)
    rule.setContent { TestList(listOf(PriorityGroup(Priority.NOW, manyTasks())), revealTaskId) }
    revealTaskId = "t40"
    rule.mainClock.advanceTimeBy(3000)
    rule.onNodeWithText("t40").assertIsDisplayed()
    assertTrue(middleOf("t40") > 400f)
  }
}
