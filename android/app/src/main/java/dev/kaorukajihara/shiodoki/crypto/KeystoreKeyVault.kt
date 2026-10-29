package dev.kaorukajihara.shiodoki.crypto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import dev.kaorukajihara.shiodoki.data.LocalStore
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The unlocked data key, encrypted by an AES key that never leaves the Android Keystore (hardware-backed where the
 * phone has it) and saved in [LocalStore], so the passphrase is asked once per phone (plan Q11). No user
 * authentication on the Keystore key: the focus screen must work from the lock screen.
 */
class KeystoreKeyVault(private val localStore: LocalStore) : KeyVault {
  override suspend fun load(uid: String): ByteArray? {
    val sealed = localStore.loadSealedDek(uid) ?: return null
    return try {
      val bytes = Base64.getDecoder().decode(sealed)
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, deviceKey(), GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
      cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES)
    } catch (_: Exception) {
      // The Keystore key is gone (app data restored on another phone, Keystore reset): unlock again.
      null
    }
  }

  override suspend fun save(uid: String, dek: ByteArray) {
    // The Keystore picks the IV itself (randomized encryption is required by default).
    val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, deviceKey()) }
    val sealed = cipher.iv + cipher.doFinal(dek)
    localStore.saveSealedDek(uid, Base64.getEncoder().encodeToString(sealed))
  }

  private fun deviceKey(): SecretKey {
    val keyStore = KeyStore.getInstance(PROVIDER).apply { load(null) }
    (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .build()
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER).apply { init(spec) }.generateKey()
  }

  private companion object {
    const val PROVIDER = "AndroidKeyStore"
    const val ALIAS = "shiodoki-data-key"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
    const val IV_BYTES = 12
    const val TAG_BITS = 128
  }
}
