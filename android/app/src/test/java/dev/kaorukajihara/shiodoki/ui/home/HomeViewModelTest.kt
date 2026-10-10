package dev.kaorukajihara.shiodoki.ui.home

import dev.kaorukajihara.shiodoki.data.DesktopStateRepository
import dev.kaorukajihara.shiodoki.data.DesktopStateSnapshot
import dev.kaorukajihara.shiodoki.data.FakeTaskRepository
import dev.kaorukajihara.shiodoki.model.TaskPatch
import dev.kaorukajihara.shiodoki.task
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {
  private val repo = FakeTaskRepository(listOf(task("t1")))
  private val desktop = object : DesktopStateRepository {
    override val snapshot = MutableStateFlow<DesktopStateSnapshot?>(null)
  }

  // viewModelScope runs on Dispatchers.Main, which a JVM test does not have.
  @Before
  fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

  @After
  fun tearDown() = Dispatchers.resetMain()

  @Test
  fun `swipe completes the task and undo makes it incomplete again`() {
    val vm = HomeViewModel(repo, desktop)
    vm.complete("t1")
    vm.undoComplete("t1")
    assertEquals(
      listOf("t1" to TaskPatch(completed = true), "t1" to TaskPatch(completed = false)),
      repo.updates,
    )
  }
}
