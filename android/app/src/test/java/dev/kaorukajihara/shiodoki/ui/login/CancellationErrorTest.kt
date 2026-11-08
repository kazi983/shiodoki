package dev.kaorukajihara.shiodoki.ui.login

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CancellationErrorTest {
  @Test
  fun `closing the picker shows nothing`() {
    // The message of credentials-play-services-auth when the user closes the picker.
    assertNull(cancellationError("activity is cancelled by the user."))
    assertNull(cancellationError("User canceled the selector"))
    assertNull(cancellationError(null))
  }

  @Test
  fun `an account refused after it was picked is shown`() {
    assertEquals(
      LoginError.Rejected("[16] Account reauth failed."),
      cancellationError("[16] Account reauth failed."),
    )
  }
}
