package dev.kaorukajihara.shiodoki

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** UI text belongs in res/values/strings.xml and its translations (docs/i18n/plan.md), never in Kotlin. */
class NoHardcodedTextTest {
  @Test
  fun `no Japanese text in Kotlin sources`() {
    // Unit tests run with the module directory (app/) as the working directory.
    val sources = File("src/main/java")
    val files = sources.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()
    // Without this, a wrong path would scan nothing and pass.
    assertTrue("no Kotlin sources under ${sources.absolutePath}", files.size > 10)
    assertEquals(emptyList<String>(), findJapanese(sources, files))
  }

  @Test
  fun `finds Japanese in code but not in comments`() {
    val dir = kotlin.io.path.createTempDirectory().toFile()
    val file = File(dir, "Sample.kt").apply {
      writeText("// \"作業ストップ\" in a comment\n * \"30分\" in KDoc\nval ok = \"Wrap up\"\nval ng = \"テスト\"\n")
    }
    assertEquals(listOf("Sample.kt:4: val ng = \"テスト\""), findJapanese(dir, listOf(file)))
    dir.deleteRecursively()
  }

  private fun findJapanese(root: File, files: List<File>): List<String> {
    val japanese = Regex("[\\p{IsHiragana}\\p{IsKatakana}\\p{IsHan}]")
    // Comments may quote the UI text; only code lines count.
    val comment = Regex("^\\s*(//|/\\*|\\*)")
    return files
      .flatMap { file ->
        file.readLines().mapIndexedNotNull { i, line ->
          if (!comment.containsMatchIn(line) && japanese.containsMatchIn(line)) {
            "${file.relativeTo(root)}:${i + 1}: ${line.trim()}"
          } else {
            null
          }
        }
      }
  }
}
