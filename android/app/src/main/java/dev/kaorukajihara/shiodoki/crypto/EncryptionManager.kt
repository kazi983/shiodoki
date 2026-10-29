package dev.kaorukajihara.shiodoki.crypto

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** How the user proves who they are. */
enum class SecretKind {
  PASSPHRASE,
  RECOVERY_KEY,
}

/** Where the data key of the signed-in account is. */
sealed interface KeyState {
  data object SignedOut : KeyState

  /** Reading the key kept on the phone or the keys document. */
  data object Checking : KeyState

  /** The account has keys; the user must type the passphrase or the recovery key once on this phone. */
  data object Locked : KeyState

  /** No keys yet: encryption is set up on the PC (plan Q13, Android only unlocks). */
  data object NoKeys : KeyState

  /** The keys document could not be read (offline, and not cached yet). */
  data object Unreachable : KeyState

  data object Unlocked : KeyState
}

/** `users/{uid}/state/keys` (docs/e2ee/design.md §4.2), salts decoded. */
class WrappedKeys(
  val passphraseSalt: ByteArray,
  val iterations: Int,
  val passphraseWrappedKey: String,
  val recoverySalt: ByteArray,
  val recoveryWrappedKey: String,
)

/** Keeps the unlocked data key on the phone between launches (Android Keystore, [KeystoreKeyVault]). */
interface KeyVault {
  suspend fun load(uid: String): ByteArray?

  suspend fun save(uid: String, dek: ByteArray)
}

/** Reads the keys document; null when there is none. Throws when it cannot be read. */
fun interface KeysSource {
  suspend fun get(uid: String): WrappedKeys?
}

/**
 * Owns the data key of the signed-in account and follows [uid]: a key kept on the phone unlocks at once, otherwise the
 * user unlocks once with the passphrase or the recovery key (docs/e2ee/design.md §4.5). Sign-out clears the vault
 * together with the other account data (`LocalStore.clearUserData`), then [uid] becomes null.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class EncryptionManager(
  private val uid: StateFlow<String?>,
  private val vault: KeyVault,
  private val keys: KeysSource,
  private val unreadable: String,
  scope: CoroutineScope,
  /** PBKDF2 with 600,000 iterations takes a second or more: never on the main thread. */
  private val kdfDispatcher: CoroutineDispatcher = Dispatchers.Default,
  private val onKeysError: (Exception) -> Unit = {},
) {
  private val _state = MutableStateFlow<KeyState>(KeyState.Checking)
  val state: StateFlow<KeyState> = _state.asStateFlow()

  private val _cipher = MutableStateFlow<FieldCipher?>(null)

  /** null until unlocked. Repositories show and write nothing without it. */
  val cipher: StateFlow<FieldCipher?> = _cipher.asStateFlow()

  private val retries = MutableStateFlow(0)
  private var wrapped: WrappedKeys? = null

  init {
    scope.launch {
      combine(uid, retries) { uid, _ -> uid }.collectLatest { check(it) }
    }
  }

  /** After [KeyState.Unreachable] or [KeyState.NoKeys] (the PC may have set it up meanwhile). */
  fun retry() {
    retries.value++
  }

  /** False when the secret is wrong. */
  suspend fun unlock(kind: SecretKind, secret: String): Boolean {
    val uid = uid.value ?: return false
    val keys = wrapped ?: return false
    val dek = withContext(kdfDispatcher) {
      when (kind) {
        SecretKind.PASSPHRASE -> E2ee.unwrapDek(
          E2ee.passphraseKek(secret, keys.passphraseSalt, keys.iterations),
          keys.passphraseWrappedKey,
        )
        SecretKind.RECOVERY_KEY ->
          E2ee.recoveryKek(secret, keys.recoverySalt)?.let { E2ee.unwrapDek(it, keys.recoveryWrappedKey) }
      }
    } ?: return false
    vault.save(uid, dek)
    use(dek)
    return true
  }

  private suspend fun check(uid: String?) {
    _cipher.value = null
    wrapped = null
    if (uid == null) {
      _state.value = KeyState.SignedOut
      return
    }
    _state.value = KeyState.Checking
    vault.load(uid)?.let {
      use(it)
      return
    }
    _state.value = try {
      keys.get(uid)?.let {
        wrapped = it
        KeyState.Locked
      } ?: KeyState.NoKeys
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      onKeysError(e)
      KeyState.Unreachable
    }
  }

  private fun use(dek: ByteArray) {
    _cipher.value = DekCipher(dek, unreadable)
    _state.value = KeyState.Unlocked
  }
}
