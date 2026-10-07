package dev.kaorukajihara.shiodoki

import android.app.Application

class ShiodokiApp : Application() {
  lateinit var container: AppContainer
    private set

  override fun onCreate() {
    super.onCreate()
    container = AppContainer(this)
  }
}
