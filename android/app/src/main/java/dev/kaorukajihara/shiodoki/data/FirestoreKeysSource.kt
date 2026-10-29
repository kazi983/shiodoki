package dev.kaorukajihara.shiodoki.data

import com.google.firebase.firestore.FirebaseFirestore
import dev.kaorukajihara.shiodoki.crypto.KeysSource
import dev.kaorukajihara.shiodoki.crypto.WrappedKeys
import kotlinx.coroutines.tasks.await

/**
 * Reads `users/{uid}/state/keys`, written by the PC's encryption setup. The default source asks the server and falls
 * back to the cache; offline with nothing cached it throws, which the unlock screen shows as "needs a connection".
 */
class FirestoreKeysSource(private val db: FirebaseFirestore) : KeysSource {
  override suspend fun get(uid: String): WrappedKeys? {
    val snap = db.collection("users").document(uid).collection("state").document("keys").get().await()
    if (!snap.exists()) return null
    // Another shape (a newer version written by a newer PC app) is an error, not "no keys".
    return checkNotNull(docToWrappedKeys(snap.data.orEmpty())) { "Unsupported state/keys document" }
  }
}
