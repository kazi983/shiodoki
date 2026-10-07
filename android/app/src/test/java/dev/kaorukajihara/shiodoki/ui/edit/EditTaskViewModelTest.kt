package dev.kaorukajihara.shiodoki.ui.edit

import dev.kaorukajihara.shiodoki.data.FakeTaskRepository
import dev.kaorukajihara.shiodoki.model.Priority
import dev.kaorukajihara.shiodoki.model.TaskInput
import dev.kaorukajihara.shiodoki.model.TaskPatch
import dev.kaorukajihara.shiodoki.task
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EditTaskViewModelTest {
  private val existing = task("t1", name = "a", priority = Priority.SOONER, memo = "m ")
  private val repo = FakeTaskRepository(listOf(existing))

  @Test
  fun `new task starts empty with NOW and adds the normalized input`() {
    val vm = EditTaskViewModel(repo, taskId = null)
    assertTrue(vm.isNew)
    assertEquals(Priority.NOW, vm.priority)

    vm.onNameChange("  b ")
    assertTrue(vm.save())
    assertEquals(listOf(TaskInput(name = "b", priority = Priority.NOW, memo = "")), repo.added)
  }

  @Test
  fun `invalid input shows the error and stays open`() {
    val vm = EditTaskViewModel(repo, taskId = null)
    assertFalse(vm.save())
    assertEquals("タスク名を入力してください", vm.error)
    assertTrue(repo.added.isEmpty())

    vm.onNameChange("b")
    assertNull(vm.error)
  }

  @Test
  fun `edit sends only the changed fields`() {
    val vm = EditTaskViewModel(repo, taskId = "t1")
    assertEquals("a", vm.name)
    vm.priority = Priority.NOW
    assertTrue(vm.save())
    // The stored memo has a trailing space; leaving it untouched must not send it.
    assertEquals(listOf("t1" to TaskPatch(priority = Priority.NOW)), repo.updates)
  }

  @Test
  fun `later snapshots do not overwrite the form`() {
    val vm = EditTaskViewModel(repo, taskId = "t1")
    repo.snapshot.value = repo.snapshot.value!!.copy(tasks = listOf(existing.copy(name = "z")))
    assertEquals("a", vm.name)
  }

  @Test
  fun `complete and delete`() {
    val vm = EditTaskViewModel(repo, taskId = "t1")
    vm.complete()
    vm.delete()
    assertEquals(
      listOf("t1" to TaskPatch(completed = true), "t1" to TaskPatch(deleted = true)),
      repo.updates,
    )
  }

  @Test
  fun `unknown or deleted task is not found`() {
    assertTrue(EditTaskViewModel(repo, taskId = "missing").notFound)
    val deletedRepo = FakeTaskRepository(listOf(existing.copy(deleted = true)))
    assertTrue(EditTaskViewModel(deletedRepo, taskId = "t1").notFound)
  }
}
