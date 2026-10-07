package dev.kaorukajihara.shiodoki.data

import android.util.Log
import com.google.firebase.firestore.DocumentSnapshot.ServerTimestampBehavior
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn

/**
 * [DesktopStateRepository] backed by a snapshot listener on `users/{uid}/state/desktop`. Like
 * [FirestoreTaskRepository], one listener per process follows the signed-in user.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FirestoreDesktopStateRepository(
  private val db: FirebaseFirestore,
  uid: StateFlow<String?>,
  scope: CoroutineScope,
) : DesktopStateRepository {

  override val snapshot: StateFlow<DesktopStateSnapshot?> = uid
    .flatMapLatest { uid -> if (uid == null) flowOf(null) else snapshots(uid) }
    .stateIn(scope, SharingStarted.Eagerly, null)

  private fun snapshots(uid: String): Flow<DesktopStateSnapshot> = callbackFlow {
    val registration = db.collection("users").document(uid).collection("state").document("desktop")
      .addSnapshotListener { snap, e ->
        if (e != null) {
          Log.w(TAG, "Desktop state listener failed", e)
          return@addSnapshotListener
        }
        if (snap == null) return@addSnapshotListener
        val state = if (snap.exists()) {
          docToDesktopState(snap.getData(ServerTimestampBehavior.ESTIMATE).orEmpty())
        } else {
          null
        }
        trySend(DesktopStateSnapshot(state))
      }
    awaitClose { registration.remove() }
  }

  private companion object {
    const val TAG = "FirestoreDesktopState"
  }
}
