import java.util.Properties

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.kotlin.serialization)
  alias(libs.plugins.google.services)
}

// Machine-local switches (local.properties is not committed).
val localProperties = Properties().apply {
  val file = rootProject.file("local.properties")
  if (file.exists()) file.inputStream().use { load(it) }
}
val useFirebaseEmulator = localProperties.getProperty("shiodoki.useFirebaseEmulator") == "true"

val keystoreProperties = Properties().apply {
  val file = rootProject.file("keystore.properties")
  if (file.exists()) file.inputStream().use { load(it) }
}

android {
  namespace = "dev.kaorukajihara.shiodoki"
  compileSdk = 37

  defaultConfig {
    applicationId = "dev.kaorukajihara.shiodoki"
    minSdk = 29
    targetSdk = 37
    versionCode = 2
    versionName = "0.2.0"
    buildConfigField("boolean", "USE_FIREBASE_EMULATOR", "false")
  }

  buildFeatures {
    compose = true
    buildConfig = true
    resValues = true
  }

  signingConfigs {
    if (keystoreProperties.isNotEmpty()) {
      create("release") {
        storeFile = file(keystoreProperties.getProperty("storeFile"))
        storePassword = keystoreProperties.getProperty("storePassword")
        keyAlias = keystoreProperties.getProperty("keyAlias")
        keyPassword = keystoreProperties.getProperty("keyPassword")
      }
    }
  }

  buildTypes {
    debug {
      // A separate app (dev.kaorukajihara.shiodoki.debug), so it installs next to the release build.
      // Its launcher icon background comes from src/debug/res.
      applicationIdSuffix = ".debug"
      versionNameSuffix = "-debug"
      resValue("string", "app_name", "Shiodoki (debug)")
      // Only debug builds may talk to the local Firebase emulators (design §9.3).
      buildConfigField("boolean", "USE_FIREBASE_EMULATOR", useFirebaseEmulator.toString())
    }
    release {
      optimization {
        enable = false
      }
      signingConfig = signingConfigs.findByName("release")
    }
  }
  androidResources {
    // Lists English and Japanese for the per-app language setting (Android 13+), from the
    // values-* folders; res/resources.properties names the language of the default folder.
    generateLocaleConfig = true
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

dependencies {
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.viewmodel.compose)
  implementation(libs.androidx.lifecycle.service)
  implementation(libs.androidx.datastore.preferences)
  implementation(libs.androidx.navigation.compose)
  implementation(platform(libs.androidx.compose.bom))
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.text.google.fonts)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.material.icons.core)
  implementation(platform(libs.firebase.bom))
  implementation(libs.firebase.auth)
  implementation(libs.firebase.firestore)
  implementation(libs.androidx.credentials)
  implementation(libs.androidx.credentials.play.services.auth)
  implementation(libs.googleid)
  implementation(libs.kotlinx.coroutines.play.services)
  implementation(libs.kotlinx.serialization.core)
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
  debugImplementation(libs.androidx.compose.ui.tooling)
}
