package dev.kaorukajihara.shiodoki.crypto

import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The keys are the ones desktop `crypto.ts` wrapped in [E2eeTest] (1,000 iterations, DEK 000102…1f). */
@OptIn(ExperimentalCoroutinesApi::class)
class EncryptionManagerTest {
  private val dek = ByteArray(32) { it.toByte() }
  private val keys = WrappedKeys(
    passphraseSalt = SALT,
    iterations = 1000,
    passphraseWrappedKey = "e1:/TO1WymGfthCKA0dUdk4XFeWjIFOQNg2bZ1kWPaCLzubwYow1PuHQ/6cRbz59Aq9lbeGdkptDM4/giyO",
    recoverySalt = SALT,
    recoveryWrappedKey = "e1:Z/d5doQA4zJ3IAuo24RC6oz9a8NWHn2TKK4LoT6wyei1C1kGQwkO1G7BfCLk0AzXEmRm4RJfTv2pst8S",
  )

  private class MemoryVault : KeyVault {
    val saved = mutableMapOf<String, ByteArray>()

    override suspend fun load(uid: String) = saved[uid]

    override suspend fun save(uid: String, dek: ByteArray) {
      saved[uid] = dek
    }
  }

  private fun TestScope.manager(
    uid: MutableStateFlow<String?>,
    vault: KeyVault = MemoryVault(),
    source: KeysSource = KeysSource { keys },
  ): EncryptionManager {
    val dispatcher = StandardTestDispatcher(testScheduler)
    return EncryptionManager(uid, vault, source, "(unreadable)", backgroundScope, dispatcher)
  }

  @Test
  fun `locked until the passphrase is right, then the key is kept for the next launch`() = runTest {
    val uid = MutableStateFlow<String?>("alice")
    val vault = MemoryVault()
    val manager = manager(uid, vault)
    runCurrent()
    assertEquals(KeyState.Locked, manager.state.value)
    assertNull(manager.cipher.value)

    assertFalse(manager.unlock(SecretKind.PASSPHRASE, "ちがうパスフレーズです"))
    assertEquals(KeyState.Locked, manager.state.value)
    assertTrue(manager.unlock(SecretKind.PASSPHRASE, "がっこうのパスフレーズ"))
    assertEquals(KeyState.Unlocked, manager.state.value)
    assertArrayEquals(dek, vault.saved["alice"])

    // The next launch: unlocked from the vault, the keys document is not even read.
    val relaunched = manager(uid, vault, KeysSource { error("must not be read") })
    runCurrent()
    assertEquals(KeyState.Unlocked, relaunched.state.value)
  }

  @Test
  fun `the recovery key unlocks in any case, a wrong or malformed one does not`() = runTest {
    val manager = manager(MutableStateFlow("alice"))
    runCurrent()
    assertFalse(manager.unlock(SecretKind.RECOVERY_KEY, "K7QM-2XRT"))
    assertFalse(manager.unlock(SecretKind.RECOVERY_KEY, "10QM-2XRT-P9DW-H4NA-VC3E-J8KZ-R6FY-T2GB"))
    assertTrue(manager.unlock(SecretKind.RECOVERY_KEY, "k7qm2xrtp9dwh4navc3ej8kzr6fyt2gb"))
    assertEquals(KeyState.Unlocked, manager.state.value)
  }

  @Test
  fun `the cipher reads desktop data and shows a placeholder for what it cannot read`() = runTest {
    val manager = manager(MutableStateFlow("alice"))
    runCurrent()
    manager.unlock(SecretKind.PASSPHRASE, "がっこうのパスフレーズ")
    val cipher = manager.cipher.value!!
    assertEquals("要件を書く 🌊", cipher.open("e1:Lgv49kjCDyaMIEHJAddoQi9V6h05bgPtZ0jLLu7chu4xSB2MlPlU1V0CBQV+knRs"))
    assertEquals("old plain name", cipher.open("old plain name"))
    assertEquals("(unreadable)", cipher.open("e1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"))
    assertEquals("memo", cipher.open(cipher.seal("memo")))
  }

  @Test
  fun `no keys, offline and retry`() = runTest {
    var result: () -> WrappedKeys? = { null }
    val manager = manager(MutableStateFlow("alice"), source = KeysSource { result() })
    runCurrent()
    assertEquals(KeyState.NoKeys, manager.state.value)

    result = { throw IOException("offline") }
    manager.retry()
    runCurrent()
    assertEquals(KeyState.Unreachable, manager.state.value)

    // The PC has set up encryption meanwhile.
    result = { keys }
    manager.retry()
    runCurrent()
    assertEquals(KeyState.Locked, manager.state.value)
  }

  @Test
  fun `signing out or switching accounts drops the key`() = runTest {
    val uid = MutableStateFlow<String?>("alice")
    val vault = MemoryVault()
    val manager = manager(uid, vault)
    runCurrent()
    manager.unlock(SecretKind.PASSPHRASE, "がっこうのパスフレーズ")

    uid.value = null
    runCurrent()
    assertEquals(KeyState.SignedOut, manager.state.value)
    assertNull(manager.cipher.value)

    // Another account does not get alice's key.
    uid.value = "bob"
    runCurrent()
    assertEquals(KeyState.Locked, manager.state.value)
    assertFalse(manager.unlock(SecretKind.PASSPHRASE, "wrong-for-bob"))
  }

  private companion object {
    val SALT = ByteArray(16) { (it * 0x11).toByte() }
  }
}
