package dev.kaorukajihara.shiodoki.data

import android.util.Log
import com.google.android.gms.tasks.Task as GmsTask
import com.google.firebase.Timestamp
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.DocumentSnapshot.ServerTimestampBehavior
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.MetadataChanges
import dev.kaorukajihara.shiodoki.model.TaskInput
import dev.kaorukajihara.shiodoki.model.TaskPatch
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn

/**
 * [TaskRepository] backed by Firestore with its offline cache (design §4).
 *
 * The process keeps a single snapshot listener for the signed-in user (design §3.2), started
 * eagerly in [scope] so the task list is already in memory when a screen opens (N-06). Signing out
 * or switching users removes the listener ([uid] changes, `flatMapLatest` cancels the old flow).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FirestoreTaskRepository(
  private val db: FirebaseFirestore,
  private val uid: StateFlow<String?>,
  scope: CoroutineScope,
) : TaskRepository {

  override val snapshot: StateFlow<TasksSnapshot?> = uid
    .flatMapLatest { uid -> if (uid == null) flowOf(null) else snapshots(uid) }
    .stateIn(scope, SharingStarted.Eagerly, null)

  private val _writeFailures = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
  override val writeFailures: Flow<Unit> = _writeFailures.asSharedFlow()

  override fun add(input: TaskInput): String {
    // Client-side id, so a retried write cannot create a duplicate (design §4.3).
    val id = UUID.randomUUID().toString()
    val tasks = tasksRef() ?: return id
    tasks.document(id).set(newTaskDoc(input, Timestamp.now())).fire("add $id")
    return id
  }

  override fun update(id: String, patch: TaskPatch) {
    if (patch.isEmpty) return
    val tasks = tasksRef() ?: return
    tasks.document(id).update(patchToDoc(patch, Timestamp.now())).fire("update $id")
  }

  private fun tasksRef(): CollectionReference? {
    val uid = uid.value
    if (uid == null) Log.w(TAG, "Write ignored: not signed in")
    return uid?.let { db.collection("users").document(it).collection("tasks") }
  }

  /**
   * Not awaited: the returned task only completes when the server acknowledges, which never
   * happens offline (design §4.3). The SDK reverts the local change on failure.
   */
  private fun GmsTask<Void>.fire(what: String) {
    addOnFailureListener { e ->
      Log.w(TAG, "Write failed: $what", e)
      _writeFailures.tryEmit(Unit)
    }
  }

  private fun snapshots(uid: String): Flow<TasksSnapshot> = callbackFlow {
    val registration = db.collection("users").document(uid).collection("tasks")
      // Metadata changes too, so the sync status follows hasPendingWrites / isFromCache.
      .addSnapshotListener(MetadataChanges.INCLUDE) { snap, e ->
        if (e != null) {
          // The listener is dead after an error (e.g. permission denied while signing out).
          Log.w(TAG, "Task listener failed", e)
          return@addSnapshotListener
        }
        if (snap == null) return@addSnapshotListener
        val tasks = snap.documents.map { doc ->
          docToTask(doc.id, doc.getData(ServerTimestampBehavior.ESTIMATE).orEmpty())
        }
        val status = when {
          snap.metadata.hasPendingWrites() -> SyncStatus.PENDING
          snap.metadata.isFromCache -> SyncStatus.OFFLINE
          else -> SyncStatus.SYNCED
        }
        trySend(TasksSnapshot(tasks, status))
      }
    awaitClose { registration.remove() }
  }

  private companion object {
    const val TAG = "FirestoreTaskRepository"
  }
}
