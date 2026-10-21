package dev.kaorukajihara.shiodoki.ui.focus

import dev.kaorukajihara.shiodoki.data.DesktopStateRepository
import dev.kaorukajihara.shiodoki.data.DesktopStateSnapshot
import dev.kaorukajihara.shiodoki.data.FakeTaskRepository
import dev.kaorukajihara.shiodoki.task
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FocusViewModelTest {
  private val repo = FakeTaskRepository(listOf(task("t1"), task("t2")))
  private val desktop = object : DesktopStateRepository {
    override val snapshot = MutableStateFlow<DesktopStateSnapshot?>(null)
  }
  private val started = mutableListOf<Pair<String, String>>()
  private val vm by lazy { FocusViewModel(repo, desktop, flowOf(null)) { id, name -> started += id to name } }

  // viewModelScope runs on Dispatchers.Main, which a JVM test does not have.
  @Before
  fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

  @After
  fun tearDown() = Dispatchers.resetMain()

  @Test
  fun `selecting a task asks first and starts nothing`() {
    vm.select("t1", "資料作成")
    assertEquals(PendingStart("t1", "資料作成"), vm.pendingStart)
    assertTrue(started.isEmpty())
  }

  @Test
  fun `OK starts the pending task once`() {
    vm.select("t1", "資料作成")
    vm.confirmStart()
    vm.confirmStart()
    assertEquals(listOf("t1" to "資料作成"), started)
    assertNull(vm.pendingStart)
  }

  @Test
  fun `choosing again starts nothing and the next choice is the one started`() {
    vm.select("t1", "資料作成")
    vm.cancelStart()
    assertNull(vm.pendingStart)
    vm.confirmStart()
    assertTrue(started.isEmpty())

    vm.select("t2", "読書")
    vm.confirmStart()
    assertEquals(listOf("t2" to "読書"), started)
  }
}
