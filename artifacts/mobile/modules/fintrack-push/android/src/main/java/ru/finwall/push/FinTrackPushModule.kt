package ru.finwall.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import ru.rustore.sdk.core.feature.model.FeatureAvailabilityResult
import ru.rustore.sdk.pushclient.RuStorePushClient

/**
 * Push на Android (E2.2-T3): есть ли сервисы Google (FCM) и токен RuStore Push.
 * SDK RuStore инициализируется сам, если в манифесте есть ru.rustore.sdk.pushclient.project_id
 * (его ставит config-плагин для сборок rustore и apk); без него RuStore недоступен.
 */
class FinTrackPushModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FinTrackPush")

    Events("onNewToken", "onDataMessage")

    OnCreate {
      FinTrackPushService.tokenListener = { token -> sendEvent("onNewToken", mapOf("token" to token)) }
      FinTrackPushService.dataListener = { data -> sendEvent("onDataMessage", mapOf("data" to data)) }
    }

    OnDestroy {
      FinTrackPushService.tokenListener = null
      FinTrackPushService.dataListener = null
    }

    Function("hasGooglePlayServices") {
      try {
        context.packageManager.getPackageInfo("com.google.android.gms", 0)
        true
      } catch (error: PackageManager.NameNotFoundException) {
        false
      }
    }

    AsyncFunction("ruStoreAvailable") { promise: Promise ->
      if (!RuStorePushClient.isInitialized) {
        promise.resolve(false)
      } else {
        RuStorePushClient.checkPushAvailability()
          .addOnSuccessListener { result -> promise.resolve(result is FeatureAvailabilityResult.Available) }
          .addOnFailureListener { promise.resolve(false) }
      }
    }

    AsyncFunction("ruStoreToken") { promise: Promise ->
      if (!RuStorePushClient.isInitialized) {
        promise.resolve(null)
      } else {
        ensureChannel()
        RuStorePushClient.getToken()
          .addOnSuccessListener { token -> promise.resolve(token) }
          .addOnFailureListener { error -> promise.reject("ERR_RUSTORE_TOKEN", error.message, error) }
      }
    }
  }

  /** Канал «default» — его же указывает сервер в push (FCM и RuStore). */
  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Уведомления", NotificationManager.IMPORTANCE_DEFAULT))
    }
  }

  private companion object {
    const val CHANNEL_ID = "default"
  }
}
