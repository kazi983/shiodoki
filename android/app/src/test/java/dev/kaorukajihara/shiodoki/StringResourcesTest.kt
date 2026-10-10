package dev.kaorukajihara.shiodoki

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

/**
 * English (values/) and Japanese (values-ja/) must offer the same strings with the same
 * placeholders. Lint's MissingTranslation checks the keys too, but lint is not part of the
 * usual `assembleDebug testDebugUnitTest` run.
 */
class StringResourcesTest {
  private val english = load("src/main/res/values/strings.xml")
  private val japanese = load("src/main/res/values-ja/strings.xml")

  @Test
  fun `both languages have the same keys`() {
    assertTrue("too few strings: ${english.size}", english.size > 50)
    assertEquals(english.keys.sorted(), japanese.keys.sorted())
  }

  @Test
  fun `placeholders match per key`() {
    val placeholder = Regex("%\\d+\\$[sd]")
    val mismatches = english.mapNotNull { (key, text) ->
      val en = placeholder.findAll(text).map { it.value }.sorted().toList()
      val ja = placeholder.findAll(japanese[key].orEmpty()).map { it.value }.sorted().toList()
      if (en == ja) null else "$key: $en vs $ja"
    }
    assertEquals(emptyList<String>(), mismatches)
  }

  /** Translatable <string> and <bool> entries by name. */
  private fun load(path: String): Map<String, String> {
    val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File(path))
    return listOf("string", "bool").flatMap { tag ->
      val nodes = doc.getElementsByTagName(tag)
      (0 until nodes.length).map { nodes.item(it) as Element }
    }
      .filter { it.getAttribute("translatable") != "false" }
      .associate { it.getAttribute("name") to it.textContent }
  }
}
