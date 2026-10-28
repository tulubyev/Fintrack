package ru.finwall.push

import android.os.Handler
import android.os.Looper
import ru.rustore.sdk.pushclient.messaging.exception.RuStorePushClientException
import ru.rustore.sdk.pushclient.messaging.model.RemoteMessage
import ru.rustore.sdk.pushclient.messaging.service.RuStoreMessagingService

/**
 * События RuStore Push. Уведомление с полем notification SDK показывает сам, нажатие открывает deep link
 * из click_action. В JS через открытый модуль уходят новый токен и тихий push (только данные, например
 * «данные обновились»). Если приложение закрыто, токен JS возьмёт через getToken() при следующем запуске,
 * а синхронизация и так идёт при открытии.
 */
class FinTrackPushService : RuStoreMessagingService() {
  companion object {
    @Volatile
    var tokenListener: ((String) -> Unit)? = null

    @Volatile
    var dataListener: ((Map<String, String>) -> Unit)? = null
  }

  override fun onNewToken(token: String) {
    Handler(Looper.getMainLooper()).post { tokenListener?.invoke(token) }
  }

  override fun onMessageReceived(message: RemoteMessage) {
    if (message.notification != null) return
    val data = message.data.toMap()
    Handler(Looper.getMainLooper()).post { dataListener?.invoke(data) }
  }

  override fun onDeletedMessages() = Unit

  override fun onError(errors: List<RuStorePushClientException>) = Unit
}
