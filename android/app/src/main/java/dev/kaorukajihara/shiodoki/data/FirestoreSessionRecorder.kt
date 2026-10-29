package dev.kaorukajihara.shiodoki.data

import android.os.Build
import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import dev.kaorukajihara.shiodoki.crypto.FieldCipher
import dev.kaorukajihara.shiodoki.focus.SessionRecorder
import dev.kaorukajihara.shiodoki.model.FinishedSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Records a phone session like the desktop does (design §4.4): the session document and the
 * task's `increment()` in one batch, so the counters never drift from `sessions`. The task name
 * is encrypted with [cipher] (docs/e2ee/design.md).
 */
class FirestoreSessionRecorder(
  private val db: FirebaseFirestore,
  private val uid: StateFlow<String?>,
  private val cipher: StateFlow<FieldCipher?>,
  private val scope: CoroutineScope,
) : SessionRecorder {
  override fun record(session: FinishedSession) {
    val uid = uid.value
    if (uid == null) {
      Log.w(TAG, "Session ${session.id} dropped: not signed in")
      return
    }
    // Synchronous when unlocked: sign-out records the last session right before signing out (design §7.2).
    cipher.value?.let { return write(uid, it, session) }
    // A session recovered at launch (§6.6) can come before the key is read: wait for it, for the same user.
    scope.launch {
      val (nowUid, cipher) = combine(this@FirestoreSessionRecorder.uid, cipher, ::Pair)
        .first { (nowUid, cipher) -> nowUid != uid || cipher != null }
      if (nowUid == uid && cipher != null) {
        write(uid, cipher, session)
      } else {
        Log.w(TAG, "Session ${session.id} dropped: signed out before unlocking")
      }
    }
  }

  private fun write(uid: String, cipher: FieldCipher, session: FinishedSession) {
    val user = db.collection("users").document(uid)
    val batch = db.batch()
    batch.set(user.collection("sessions").document(session.id), sessionToDoc(session, Build.MODEL, cipher))
    batch.update(user.collection("tasks").document(session.taskId), sessionCountersDoc(session))
    // Not awaited: it only completes when the server acknowledges (design §4.3).
    batch.commit().addOnFailureListener { e -> Log.w(TAG, "Session ${session.id} failed", e) }
  }

  private companion object {
    const val TAG = "FirestoreSessionRecorder"
  }
}
