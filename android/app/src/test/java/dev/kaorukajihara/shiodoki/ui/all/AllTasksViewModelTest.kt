package dev.kaorukajihara.shiodoki.ui.all

import dev.kaorukajihara.shiodoki.data.FakeTaskRepository
import dev.kaorukajihara.shiodoki.model.TaskPatch
import dev.kaorukajihara.shiodoki.task
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AllTasksViewModelTest {
  private val repo = FakeTaskRepository(listOf(task("t1", completed = true, completedAt = "2026-10-19T00:00:00Z")))

  // viewModelScope runs on Dispatchers.Main, which a JVM test does not have.
  @Before
  fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

  @After
  fun tearDown() = Dispatchers.resetMain()

  @Test
  fun `starts on the open view`() {
    assertEquals(TaskFilter.OPEN, AllTasksViewModel(repo).uiState.value.filter)
  }

  @Test
  fun `swipe reopens the task and undo completes it again`() {
    val vm = AllTasksViewModel(repo)
    vm.reopen("t1")
    vm.complete("t1")
    assertEquals(
      listOf("t1" to TaskPatch(completed = false), "t1" to TaskPatch(completed = true)),
      repo.updates,
    )
  }
}
