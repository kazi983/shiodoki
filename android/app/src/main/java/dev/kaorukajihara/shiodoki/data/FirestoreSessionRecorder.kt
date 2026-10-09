package dev.kaorukajihara.shiodoki.data

import android.os.Build
import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import dev.kaorukajihara.shiodoki.focus.SessionRecorder
import dev.kaorukajihara.shiodoki.model.FinishedSession
import kotlinx.coroutines.flow.StateFlow

/**
 * Records a phone session like the desktop does (design §4.4): the session document and the
 * task's `increment()` in one batch, so the counters never drift from `sessions`.
 */
class FirestoreSessionRecorder(
  private val db: FirebaseFirestore,
  private val uid: StateFlow<String?>,
) : SessionRecorder {
  override fun record(session: FinishedSession) {
    val uid = uid.value
    if (uid == null) {
      Log.w(TAG, "Session ${session.id} dropped: not signed in")
      return
    }
    val user = db.collection("users").document(uid)
    val batch = db.batch()
    batch.set(user.collection("sessions").document(session.id), sessionToDoc(session, Build.MODEL))
    batch.update(user.collection("tasks").document(session.taskId), sessionCountersDoc(session))
    // Not awaited: it only completes when the server acknowledges (design §4.3).
    batch.commit().addOnFailureListener { e -> Log.w(TAG, "Session ${session.id} failed", e) }
  }

  private companion object {
    const val TAG = "FirestoreSessionRecorder"
  }
}
