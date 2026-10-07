package dev.kaorukajihara.shiodoki.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import dev.kaorukajihara.shiodoki.R
import dev.kaorukajihara.shiodoki.model.Priority

/*
 * Colors, fonts and shapes from the "Shiodoki UI/UX改善案" design canvas (Android page).
 * The app always uses this dark theme; it does not follow the system theme or the wallpaper.
 */

object ShiodokiColors {
  val Background = Color(0xFF0B1326)
  /** Task rows, inputs, settings cards. */
  val Surface = Color(0xFF131B2E)
  val NavBar = Color(0xFF101828)
  val NavIndicator = Color(0xFF1F2C4D)
  val Divider = Color(0xFF1C2439)
  val Outline = Color(0xFF2D3449)
  val Text = Color(0xFFDAE2FD)
  val TextStrong = Color(0xFFF2F5FF)
  val TextMuted = Color(0xFF9AA3B8)
  val Accent = Color(0xFF4D8EFF)
  val OnAccent = Color(0xFF00285D)
  val Danger = Color(0xFFFF8F8F)
  val Synced = Color(0xFF4FD1A5)
  val Pending = Color(0xFFF5C451)
}

/** The priority's color on the dark background (group markers, selected priority button). */
val Priority.color: Color
  get() = when (this) {
    Priority.NOW -> Color(0xFFFF8A4C)
    Priority.SOONER -> Color(0xFFF5C451)
    Priority.ANYTIME -> Color(0xFF4FD1A5)
    Priority.SOMEDAY -> Color(0xFF8B93A7)
  }

/** Fill of a selected priority button: the priority color faintly over the background. */
val Priority.selectedFill: Color
  get() = lerp(ShiodokiColors.Background, color, 0.2f)

/** Label of a selected priority button: a light tint of the priority color. */
val Priority.selectedText: Color
  get() = lerp(Color.White, color, 0.35f)

private val fontProvider = GoogleFont.Provider(
  providerAuthority = "com.google.android.gms.fonts",
  providerPackage = "com.google.android.gms",
  certificates = R.array.com_google_android_gms_fonts_certs,
)

/**
 * Downloaded through Google Play services on first use, so the APK stays small (Noto Sans JP is
 * several MB). Until then, or without Play services, the system font is used.
 */
private val NotoSansJp = FontFamily(
  Font(GoogleFont("Noto Sans JP"), fontProvider, FontWeight.Normal),
  Font(GoogleFont("Noto Sans JP"), fontProvider, FontWeight.Medium),
  Font(GoogleFont("Noto Sans JP"), fontProvider, FontWeight.Bold),
)

/** Numbers such as durations and dates. */
val MonoFamily = FontFamily(
  Font(GoogleFont("IBM Plex Mono"), fontProvider, FontWeight.Medium),
  Font(GoogleFont("IBM Plex Mono"), fontProvider, FontWeight.SemiBold),
)

private val colorScheme = darkColorScheme(
  primary = ShiodokiColors.Accent,
  onPrimary = ShiodokiColors.OnAccent,
  background = ShiodokiColors.Background,
  onBackground = ShiodokiColors.Text,
  surface = ShiodokiColors.Background,
  onSurface = ShiodokiColors.Text,
  surfaceVariant = ShiodokiColors.Surface,
  onSurfaceVariant = ShiodokiColors.TextMuted,
  surfaceContainer = ShiodokiColors.NavBar,
  surfaceContainerHigh = ShiodokiColors.Surface,
  surfaceContainerHighest = ShiodokiColors.Surface,
  outline = ShiodokiColors.Outline,
  outlineVariant = ShiodokiColors.Divider,
  error = ShiodokiColors.Danger,
)

private val typography = Typography().run {
  fun TextStyle.jp() = copy(fontFamily = NotoSansJp)
  Typography(
    displayLarge = displayLarge.jp(), displayMedium = displayMedium.jp(),
    displaySmall = displaySmall.jp(), headlineLarge = headlineLarge.jp(),
    headlineMedium = headlineMedium.jp(), headlineSmall = headlineSmall.jp(),
    titleLarge = titleLarge.jp(), titleMedium = titleMedium.jp(), titleSmall = titleSmall.jp(),
    bodyLarge = bodyLarge.jp(), bodyMedium = bodyMedium.jp(), bodySmall = bodySmall.jp(),
    labelLarge = labelLarge.jp(), labelMedium = labelMedium.jp(), labelSmall = labelSmall.jp(),
  )
}

@Composable
fun ShiodokiTheme(content: @Composable () -> Unit) {
  MaterialTheme(colorScheme = colorScheme, typography = typography, content = content)
}
