package dev.kaorukajihara.shiodoki.crypto

/** Encrypts and decrypts the fields that leave the phone: task names, memos, session task names (Q5). */
interface FieldCipher {
  fun seal(plain: String): String

  /**
   * Never throws: a value that is not encrypted (written before encryption) is returned as it is, and one that cannot
   * be decrypted (changed, or another key) becomes a placeholder.
   */
  fun open(value: String): String
}

/** An empty memo stays empty: nothing to hide, and most tasks have none (same as desktop). */
fun FieldCipher.sealMemo(memo: String): String = if (memo.isEmpty()) "" else seal(memo)

/** [FieldCipher] with the unlocked data key. [unreadable] is the localized placeholder (`R` stays out of here). */
class DekCipher(private val dek: ByteArray, private val unreadable: String) : FieldCipher {
  override fun seal(plain: String): String = E2ee.encryptField(dek, plain)

  override fun open(value: String): String {
    if (!E2ee.isEncrypted(value)) return value
    return try {
      E2ee.decryptField(dek, value)
    } catch (_: Exception) {
      unreadable
    }
  }
}
