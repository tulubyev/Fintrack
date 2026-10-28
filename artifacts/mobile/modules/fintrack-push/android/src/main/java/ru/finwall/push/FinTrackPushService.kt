package ru.finwall.push

import android.os.Handler
import android.os.Looper
import ru.rustore.sdk.pushclient.messaging.exception.RuStorePushClientException
import ru.rustore.sdk.pushclient.messaging.model.RemoteMessage
import ru.rustore.sdk.pushclient.messaging.service.RuStoreMessagingService

/**
 * События RuStore Push. Уведомление с полем notification SDK показывает сам, нажатие открывает deep link
 * из click_action. Здесь нужен только новый токен: его передаёт в JS открытый модуль, а если приложение
 * закрыто — JS возьмёт токен через getToken() при следующем запуске.
 */
class FinTrackPushService : RuStoreMessagingService() {
  companion object {
    @Volatile
    var tokenListener: ((String) -> Unit)? = null
  }

  override fun onNewToken(token: String) {
    Handler(Looper.getMainLooper()).post { tokenListener?.invoke(token) }
  }

  override fun onMessageReceived(message: RemoteMessage) = Unit

  override fun onDeletedMessages() = Unit

  override fun onError(errors: List<RuStorePushClientException>) = Unit
}
