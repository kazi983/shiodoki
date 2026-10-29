package dev.kaorukajihara.shiodoki.crypto

import java.text.Normalizer
import java.util.Base64
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The vectors come from desktop `src/main/crypto.ts` (salt 00112233…eeff, DEK 000102…1f, 1,000 iterations), so these
 * tests prove both apps read each other's data.
 */
class E2eeTest {
  private val salt = hex("00112233445566778899aabbccddeeff")
  private val dek = hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
  private val recoveryKey = "K7QM-2XRT-P9DW-H4NA-VC3E-J8KZ-R6FY-T2GB"

  @Test
  fun `passphrase KEK matches desktop, also for a decomposed passphrase`() {
    val expected = hex("ec115cdf6fbc1a5129c58a6d284a16843848c97f5e82ea578d0af184f72467bf")
    assertArrayEquals(expected, E2ee.passphraseKek("がっこうのパスフレーズ", salt, 1000))
    val decomposed = Normalizer.normalize("がっこうのパスフレーズ", Normalizer.Form.NFD)
    assertNotEquals("がっこうのパスフレーズ", decomposed)
    assertArrayEquals(expected, E2ee.passphraseKek(decomposed, salt, 1000))
  }

  @Test
  fun `passphrase KEK is PBKDF2-SHA256 (RFC 7914 vector)`() {
    assertArrayEquals(
      hex("55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc"),
      E2ee.passphraseKek("passwd", "salt".toByteArray(), 1),
    )
  }

  @Test
  fun `recovery KEK matches desktop, typed in any case and without dashes`() {
    val expected = hex("9e2d00752949db47e3b52d91aec96be26162d34768a0c3de31ca420e5d83d29c")
    assertArrayEquals(expected, E2ee.recoveryKek(recoveryKey, salt))
    assertArrayEquals(expected, E2ee.recoveryKek(recoveryKey.lowercase().replace("-", ""), salt))
    assertArrayEquals(expected, E2ee.recoveryKek(" ${recoveryKey.replace("-", " ")} ", salt))
  }

  @Test
  fun `O, I and L are read as 0 and 1, a wrong length or U is not a key`() {
    assertArrayEquals(
      E2ee.recoveryKek("10QM-2XRT-P9DW-H4NA-VC3E-J8KZ-R6FY-T2GB", salt),
      E2ee.recoveryKek("LOQM-2XRT-P9DW-H4NA-VC3E-J8KZ-R6FY-T2GB", salt),
    )
    assertEquals("101", E2ee.normalizeRecoveryKey("io-l"))
    assertNull(E2ee.recoveryKek("K7QM-2XRT", salt))
    assertNull(E2ee.recoveryKek("U7QM-2XRT-P9DW-H4NA-VC3E-J8KZ-R6FY-T2GB", salt))
  }

  @Test
  fun `unwraps the DEK wrapped by desktop with either KEK, and rejects the wrong one`() {
    val passphraseWrapped = "e1:/TO1WymGfthCKA0dUdk4XFeWjIFOQNg2bZ1kWPaCLzubwYow1PuHQ/6cRbz59Aq9lbeGdkptDM4/giyO"
    val recoveryWrapped = "e1:Z/d5doQA4zJ3IAuo24RC6oz9a8NWHn2TKK4LoT6wyei1C1kGQwkO1G7BfCLk0AzXEmRm4RJfTv2pst8S"
    assertArrayEquals(dek, E2ee.unwrapDek(E2ee.passphraseKek("がっこうのパスフレーズ", salt, 1000), passphraseWrapped))
    assertArrayEquals(dek, E2ee.unwrapDek(E2ee.recoveryKek(recoveryKey, salt)!!, recoveryWrapped))
    assertNull(E2ee.unwrapDek(E2ee.passphraseKek("ちがうパスフレーズです", salt, 1000), passphraseWrapped))
    assertNull(E2ee.unwrapDek(dek, "e1:broken"))
  }

  @Test
  fun `decrypts fields encrypted by desktop`() {
    val field = "e1:Lgv49kjCDyaMIEHJAddoQi9V6h05bgPtZ0jLLu7chu4xSB2MlPlU1V0CBQV+knRs"
    assertEquals("要件を書く 🌊", E2ee.decryptField(dek, field))
    assertEquals("", E2ee.decryptField(dek, "e1:DxO/9oc9UvDF02vqR6AaBKmgtAlp57GW2t97Tg=="))
  }

  @Test
  fun `round trip with the desktop layout and a fresh IV every time`() {
    val value = E2ee.encryptField(dek, "abc")
    assertTrue(E2ee.isEncrypted(value))
    assertEquals(12 + 3 + 16, Base64.getDecoder().decode(value.removePrefix("e1:")).size)
    assertEquals("abc", E2ee.decryptField(dek, value))
    assertNotEquals(value, E2ee.encryptField(dek, "abc"))
  }

  @Test
  fun `a changed byte, the wrong key or plain text fails`() {
    val bytes = Base64.getDecoder().decode(E2ee.encryptField(dek, "secret").removePrefix("e1:"))
    bytes[14] = (bytes[14].toInt() xor 1).toByte()
    val changed = "e1:" + Base64.getEncoder().encodeToString(bytes)
    assertThrows(Exception::class.java) { E2ee.decryptField(dek, changed) }
    assertThrows(Exception::class.java) { E2ee.decryptField(ByteArray(32), E2ee.encryptField(dek, "secret")) }
    assertThrows(Exception::class.java) { E2ee.decryptField(dek, "plain text") }
  }

  private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
}
