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
  private val held = mutableListOf<Pair<Int, String>>()
  private val vm by lazy {
    FocusViewModel(repo, desktop, flowOf(null), holdScreen = { h, r -> held += h to r }) { id, name ->
      started += id to name
    }
  }

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

  // --- hold sheet (M-20) ---

  @Test
  fun `the hold sheet starts at one hour and closes without holding`() {
    vm.openHoldSheet()
    assertTrue(vm.holdSheetOpen)
    assertEquals(2, vm.holdHalfHours)
    vm.closeHoldSheet()
    assertEquals(false, vm.holdSheetOpen)
    assertTrue(held.isEmpty())
  }

  @Test
  fun `the wheels keep the duration between 30 minutes and 72 hours`() {
    vm.setHoldTime(48, 30)
    assertEquals(97, vm.holdHalfHours)
    vm.setHoldTime(0, 0)
    assertEquals(1, vm.holdHalfHours)
    vm.setHoldTime(72, 30)
    assertEquals(144, vm.holdHalfHours)
  }

  @Test
  fun `hold needs a reason of 3 characters`() {
    vm.openHoldSheet()
    vm.setHoldTime(3, 0)
    vm.onHoldReasonChange("旅行")
    vm.hold()
    assertTrue(held.isEmpty())
    assertEquals(false, vm.canHold)
    vm.onHoldReasonChange("旅行中")
    vm.hold()
    assertEquals(listOf(6 to "旅行中"), held)
    assertEquals(false, vm.holdSheetOpen)
  }
}
