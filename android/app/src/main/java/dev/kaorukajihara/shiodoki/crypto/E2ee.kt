package dev.kaorukajihara.shiodoki.crypto

import java.security.SecureRandom
import java.text.Normalizer
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * End-to-end encryption primitives, the same formats as desktop `src/main/crypto.ts` (docs/e2ee/design.md §4).
 * Plain Kotlin/JVM, no Android classes, so the unit tests run on the JVM.
 *
 * Android only unlocks (plan Q13): it never creates or re-wraps keys, so there is no wrap function.
 */
object E2ee {
  const val PREFIX = "e1:"
  private const val KEY_BYTES = 32
  private const val IV_BYTES = 12
  private const val TAG_BITS = 128
  private const val RECOVERY_KEY_BYTES = 20
  private const val RECOVERY_INFO = "shiodoki recovery v1"

  /** Crockford base32: no I, L, O, U. */
  private const val BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

  private val random = SecureRandom()

  fun isEncrypted(value: String): Boolean = value.startsWith(PREFIX)

  /** "e1:" + base64(iv ‖ ciphertext ‖ tag): `AES/GCM/NoPadding` already puts the tag at the end. */
  fun encryptField(dek: ByteArray, plain: String): String {
    // Never reuse an IV with the same key: always a new random one.
    val iv = ByteArray(IV_BYTES).also(random::nextBytes)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(dek, "AES"), GCMParameterSpec(TAG_BITS, iv))
    return PREFIX + Base64.getEncoder().encodeToString(iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8)))
  }

  /** Throws when the value is not "e1:", was changed, or the key is wrong (GCM tag check). */
  fun decryptField(dek: ByteArray, value: String): String = open(dek, value).toString(Charsets.UTF_8)

  /** Null when the KEK is wrong (the secret did not match) or the value is broken. */
  fun unwrapDek(kek: ByteArray, wrapped: String): ByteArray? =
    try {
      open(kek, wrapped).takeIf { it.size == KEY_BYTES }
    } catch (_: Exception) {
      null
    }

  /**
   * PBKDF2-HMAC-SHA256 over the NFC-normalized UTF-8 bytes, 32 bytes out. Written with [Mac] instead of
   * `SecretKeyFactory`, whose `PBEKeySpec` takes chars and leaves their byte encoding to the provider.
   * Slow on purpose (600,000 iterations): call it off the main thread.
   */
  fun passphraseKek(passphrase: String, salt: ByteArray, iterations: Int): ByteArray {
    val password = Normalizer.normalize(passphrase, Normalizer.Form.NFC).toByteArray(Charsets.UTF_8)
    val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(password, "HmacSHA256")) }
    // One block is enough: the output is as long as SHA-256.
    var u = mac.doFinal(salt + byteArrayOf(0, 0, 0, 1))
    val result = u.copyOf()
    repeat(iterations - 1) {
      u = mac.doFinal(u)
      for (i in result.indices) result[i] = (result[i].toInt() xor u[i].toInt()).toByte()
    }
    return result
  }

  /** HKDF-SHA256 (RFC 5869) of the decoded recovery key. Null when it is not a valid key. */
  fun recoveryKek(recoveryKey: String, salt: ByteArray): ByteArray? {
    val ikm = decodeRecoveryKey(recoveryKey) ?: return null
    val prk = hmac(salt, ikm)
    return hmac(prk, RECOVERY_INFO.toByteArray(Charsets.UTF_8) + byteArrayOf(1)).copyOf(KEY_BYTES)
  }

  /** Accepts any case, with or without dashes and spaces; O is read as 0 and I / L as 1. */
  fun normalizeRecoveryKey(input: String): String =
    input.uppercase()
      .filterNot { it == '-' || it.isWhitespace() }
      .replace('O', '0')
      .replace('I', '1')
      .replace('L', '1')

  private fun decodeRecoveryKey(input: String): ByteArray? {
    val text = normalizeRecoveryKey(input)
    if (text.length != RECOVERY_KEY_BYTES * 8 / 5) return null
    val out = ByteArray(RECOVERY_KEY_BYTES)
    var bits = 0
    var value = 0
    var index = 0
    for (char in text) {
      val digit = BASE32.indexOf(char)
      if (digit < 0) return null
      value = ((value shl 5) or digit) and 0xFFFF
      bits += 5
      if (bits >= 8) {
        bits -= 8
        out[index++] = (value shr bits).toByte()
      }
    }
    return out
  }

  private fun open(key: ByteArray, value: String): ByteArray {
    require(isEncrypted(value)) { "Not an encrypted value" }
    val bytes = Base64.getDecoder().decode(value.substring(PREFIX.length))
    require(bytes.size >= IV_BYTES + TAG_BITS / 8) { "Encrypted value is too short" }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
    return cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES)
  }

  private fun hmac(key: ByteArray, data: ByteArray): ByteArray =
    Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(data)
}
