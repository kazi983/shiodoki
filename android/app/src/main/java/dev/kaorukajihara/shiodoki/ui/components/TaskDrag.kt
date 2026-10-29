package dev.kaorukajihara.shiodoki.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitLongPressOrCancellation
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.lazy.LazyItemScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChangeIgnoreConsumed
import androidx.compose.ui.layout.LocalPinnableContainer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.Task
import dev.kaorukajihara.shiodoki.model.TaskDrop
import dev.kaorukajihara.shiodoki.ui.home.PriorityGroup
import dev.kaorukajihara.shiodoki.ui.theme.color
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/*
 * Drag and drop of task rows between and across priority headings (design §5.3): a long press lifts a row, the
 * list scrolls on its own near the top and bottom edges, and the drop moves the task, changing its priority when
 * it lands under another heading.
 */

/** A line of a task list grouped by priority: a heading, or a task under the closest heading above it. */
sealed interface TaskListEntry {
  val key: String

  data class Heading(val priority: Priority) : TaskListEntry {
    override val key: String
      get() = "heading:${priority.name}"
  }

  data class Row(val task: Task) : TaskListEntry {
    override val key: String
      get() = task.id
  }
}

/**
 * Each group's heading followed by its tasks. [allHeadings] adds the priorities without tasks too, as drop targets
 * while a row is dragged.
 */
fun entriesOf(groups: List<PriorityGroup>, allHeadings: Boolean): List<TaskListEntry> {
  val tasks = groups.associate { it.priority to it.tasks }
  val priorities = if (allHeadings) Priority.entries else groups.map { it.priority }
  return priorities.flatMap { p -> listOf(TaskListEntry.Heading(p)) + tasks[p].orEmpty().map(TaskListEntry::Row) }
}

/** The entry at [from] moved to [to]. Nothing goes above the first heading. */
fun List<TaskListEntry>.moved(from: Int, to: Int): List<TaskListEntry> {
  if (from == to || from !in indices || to !in 1..lastIndex) return this
  return toMutableList().apply { add(to, removeAt(from)) }
}

/** Without the headings that have no rows under them: the list as shown when not dragging. */
fun List<TaskListEntry>.withoutEmptyHeadings(): List<TaskListEntry> = filterIndexed { i, entry ->
  entry !is TaskListEntry.Heading || getOrNull(i + 1) is TaskListEntry.Row
}

/** Where the task [taskId] is: the heading above it and the rows under that heading. null when it is not listed. */
fun List<TaskListEntry>.dropOf(taskId: String): TaskDrop? {
  val index = indexOfFirst { it.key == taskId }
  if (index < 0) return null
  val headingIndex = (index downTo 0).firstOrNull { this[it] is TaskListEntry.Heading } ?: return null
  val heading = this[headingIndex] as TaskListEntry.Heading
  val rows = drop(headingIndex + 1).takeWhile { it is TaskListEntry.Row }.map { it.key }
  return TaskDrop(taskId, heading.priority, rows)
}

/**
 * The drag of one task list. Rows keep their place in the [LazyListState] layout and are drawn moved by
 * [offsetOf]; [entries] is the order shown while a row is dragged, and until the drop shows up in the next
 * snapshot (so the row does not jump back for a frame).
 */
@Stable
class TaskDragState internal constructor(
  private val listState: LazyListState,
  private val scope: CoroutineScope,
  private val haptics: HapticFeedback,
  /** Distance from the top or bottom edge within which the list scrolls by itself. */
  private val edgePx: Float,
  /** Scroll per frame with the row at the very edge. */
  private val maxStepPx: Float,
) {
  /** Writes the drop and returns whether it changed anything. Set on every composition. */
  internal var onDrop: (TaskDrop) -> Boolean = { false }

  var entries by mutableStateOf<List<TaskListEntry>?>(null)
    private set

  var draggingKey by mutableStateOf<String?>(null)
    private set

  /** Settling into place after the drop; the row is still drawn above the others. */
  var isDropping by mutableStateOf(false)
    private set

  private var groups: List<PriorityGroup> = emptyList()

  /** Top of the dragged row in list coordinates at the start; with [dragDelta], where it is drawn. */
  private var startOffset = 0
  private var dragDelta by mutableFloatStateOf(0f)
  private var rowSize = 0
  private val settle = Animatable(0f)
  private var autoScroll: Job? = null

  /** The layout the last move was decided on: the next move waits for the layout that shows it. */
  private var movedOnLayout: Any? = null

  /** The groups shown when the drop was written; entries are kept until newer ones arrive. */
  private var groupsAtDrop: List<PriorityGroup>? = null

  internal fun onGroups(groups: List<PriorityGroup>) {
    this.groups = groups
    val key = draggingKey
    // Completed or deleted on another device while dragged (design §5.3): drop nothing.
    if (key != null && !isDropping && groups.none { g -> g.tasks.any { it.id == key } }) cancel()
    if (groupsAtDrop != null && groups !== groupsAtDrop) {
      groupsAtDrop = null
      entries = null
    }
  }

  /** Lifts the task row at [y] (in list coordinates). False when there is none, such as on a heading. */
  internal fun start(y: Float): Boolean {
    if (draggingKey != null) return false
    val info = listState.layoutInfo
    val at = y + info.viewportStartOffset
    val row = info.visibleItemsInfo.firstOrNull { at >= it.offset && at < it.offset + it.size } ?: return false
    val key = row.key as? String ?: return false
    if (groups.none { g -> g.tasks.any { it.id == key } }) return false
    groupsAtDrop = null
    entries = entriesOf(groups, allHeadings = true)
    startOffset = row.offset
    rowSize = row.size
    dragDelta = 0f
    movedOnLayout = null
    draggingKey = key
    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
    return true
  }

  internal fun dragBy(dy: Float) {
    if (draggingKey == null || isDropping) return
    val info = listState.layoutInfo
    // The row stays within the list; holding it at an edge scrolls instead.
    val maxTop = (info.viewportEndOffset - rowSize).coerceAtLeast(info.viewportStartOffset)
    dragDelta = (startOffset + dragDelta + dy).coerceIn(info.viewportStartOffset.toFloat(), maxTop.toFloat()) -
      startOffset
    moveIfNeeded()
    autoScrollIfNeeded()
  }

  /** Scrolls frame by frame while the dragged row is near an edge and the list can still move that way. */
  private fun autoScrollIfNeeded() {
    if (autoScroll?.isActive == true || scrollStep() == 0f) return
    autoScroll = scope.launch {
      while (draggingKey != null && !isDropping) {
        val step = scrollStep()
        if (step == 0f) break
        withFrameNanos {}
        listState.scrollBy(step)
        moveIfNeeded()
      }
    }
  }

  private fun scrollStep(): Float {
    val step = edgeStep()
    val canScroll = if (step > 0f) listState.canScrollForward else listState.canScrollBackward
    return if (canScroll) step else 0f
  }

  internal fun drop() {
    val key = draggingKey ?: return
    if (isDropping) return
    autoScroll?.cancel()
    val drop = entries?.dropOf(key)
    val wrote = drop != null && onDrop(drop)
    if (wrote) groupsAtDrop = groups
    isDropping = true
    scope.launch {
      settle.snapTo(displacement(key))
      settle.animateTo(0f, spring(stiffness = Spring.StiffnessMediumLow))
      draggingKey = null
      isDropping = false
      // Until the drop shows up in the next snapshot, show its order with the usual headings only. Not before the
      // row has settled: removing headings moves the rows under it.
      entries = if (wrote) entries?.withoutEmptyHeadings() else null
    }
  }

  internal fun cancel() {
    if (draggingKey == null || isDropping) return
    autoScroll?.cancel()
    draggingKey = null
    isDropping = false
    entries = null
  }

  /** How far [key] is drawn from its place in the layout. */
  fun offsetOf(key: String): Float = when {
    key != draggingKey -> 0f
    isDropping -> settle.value
    else -> displacement(key)
  }

  /** The priority the dragged row is under now, for its color bar. */
  fun priorityOf(key: String): Priority? = entries?.dropOf(key)?.priority

  private fun displacement(key: String): Float {
    val row = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.key == key } ?: return 0f
    return startOffset + dragDelta - row.offset
  }

  /**
   * Swaps the dragged row with the line under its center. Called on every move and every new layout, so a fast
   * move followed by a still finger keeps swapping until the order matches where the row is drawn.
   */
  internal fun moveIfNeeded() {
    val key = draggingKey ?: return
    val current = entries ?: return
    val info = listState.layoutInfo
    if (info === movedOnLayout) return
    val center = startOffset + dragDelta + rowSize / 2f
    val target = info.visibleItemsInfo
      .firstOrNull { it.key != key && center >= it.offset && center <= it.offset + it.size }
      ?: return
    val from = current.indexOfFirst { it.key == key }
    val to = current.indexOfFirst { it.key == target.key }
    if (to < 1 || from < 0) return
    // The list keeps the first visible item in place; when that is one of the two, keep the scroll position instead
    // so the list does not jump with it.
    val first = listState.firstVisibleItemIndex
    if (from == first || to == first) listState.requestScrollToItem(first, listState.firstVisibleItemScrollOffset)
    entries = current.moved(from, to)
    movedOnLayout = info
  }

  /** Scroll for this frame: faster the closer the dragged row is to the top or bottom edge. */
  private fun edgeStep(): Float {
    val info = listState.layoutInfo
    val top = startOffset + dragDelta
    val fromTop = top - info.viewportStartOffset
    val fromBottom = info.viewportEndOffset - (top + rowSize)
    return when {
      fromTop < edgePx && fromTop <= fromBottom -> -maxStepPx * (1f - fromTop / edgePx).coerceIn(0f, 1f)
      fromBottom < edgePx -> maxStepPx * (1f - fromBottom / edgePx).coerceIn(0f, 1f)
      else -> 0f
    }
  }
}

/**
 * A [TaskDragState] for the list in [listState], showing [groups]. [onDrop] writes a drop and returns whether it
 * changed anything.
 */
@Composable
fun rememberTaskDragState(
  listState: LazyListState,
  groups: List<PriorityGroup>,
  onDrop: (TaskDrop) -> Boolean,
): TaskDragState {
  val scope = rememberCoroutineScope()
  val haptics = LocalHapticFeedback.current
  val density = LocalDensity.current
  val state = remember(listState) {
    with(density) { TaskDragState(listState, scope, haptics, edgePx = 80.dp.toPx(), maxStepPx = 16.dp.toPx()) }
  }
  SideEffect {
    state.onDrop = onDrop
    state.onGroups(groups)
  }
  LaunchedEffect(state) { snapshotFlow { listState.layoutInfo }.collect { state.moveIfNeeded() } }
  return state
}

/**
 * Goes on the list: a long press on a task row (the system long-press time) lifts it, and the finger moves it.
 * The gesture belongs to the list rather than the row, because the row moves within the list while dragged.
 * Once lifted, every event is consumed before the rows see it, so the release is not a click, the row is not
 * swiped, and the list does not scroll under the finger (it scrolls near the edges instead).
 */
fun Modifier.taskDrag(state: TaskDragState): Modifier = pointerInput(state) {
  awaitEachGesture {
    val down = awaitFirstDown(requireUnconsumed = false)
    // Cancelled when the list scrolls or a row is swiped first.
    val press = awaitLongPressOrCancellation(down.id) ?: return@awaitEachGesture
    if (!state.start(press.position.y)) return@awaitEachGesture
    try {
      while (true) {
        val change = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull { it.id == press.id }
        if (change == null || !change.pressed) {
          change?.consume()
          state.drop()
          break
        }
        val dy = change.positionChangeIgnoreConsumed().y
        change.consume()
        state.dragBy(dy)
      }
    } catch (e: CancellationException) {
      state.cancel()
      throw e
    }
  }
}

/** A task row of a list with [taskDrag]: drawn lifted and moved while it is the dragged one. */
@Composable
fun LazyItemScope.DraggableTaskRow(state: TaskDragState, key: String, shape: Shape, content: @Composable () -> Unit) {
  val dragging = state.draggingKey == key
  val lift by animateFloatAsState(if (dragging && !state.isDropping) 1f else 0f, label = "lift")
  // Keep the row composed while the list scrolls under it.
  val pinnable = LocalPinnableContainer.current
  DisposableEffect(dragging) {
    val handle = if (dragging) pinnable?.pin() else null
    onDispose { handle?.release() }
  }
  val bar = if (dragging) state.priorityOf(key)?.color else null
  Box(
    (if (dragging) Modifier.zIndex(1f) else Modifier.animateItem())
      .graphicsLayer {
        translationY = state.offsetOf(key)
        val scale = 1f + 0.03f * lift
        scaleX = scale
        scaleY = scale
        shadowElevation = 8.dp.toPx() * lift
        this.shape = shape
        clip = lift > 0f
      }
      // The color of the priority the row would land in.
      .drawWithContent {
        drawContent()
        if (bar != null) drawRect(bar, size = Size(4.dp.toPx(), size.height))
      },
  ) {
    content()
  }
}
