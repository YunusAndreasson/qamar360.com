package com.qamar360.continuedwork

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * The foreground service behind ContinuedWorkModule. It keeps the process in the foreground and
 * owns the progress notification. The work itself runs on the app's own JS and native threads.
 */
class ContinuedWorkService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_CANCEL) {
      onStop?.invoke("cancelled")
      stop()
      return START_NOT_STICKY
    }
    val title = intent?.getStringExtra(EXTRA_TITLE).orEmpty()
    val subtitle = intent?.getStringExtra(EXTRA_SUBTITLE).orEmpty()
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification(this, title, subtitle, 0, 0),
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
    )
    running = true
    return START_NOT_STICKY
  }

  // Android 15 and newer cap dataSync services at 6 hours a day. Stop cleanly when that runs out.
  override fun onTimeout(startId: Int, fgsType: Int) {
    onStop?.invoke("expired")
    stop()
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  private fun stop() {
    running = false
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  companion object {
    const val ACTION_START = "com.qamar360.continuedwork.START"
    const val ACTION_CANCEL = "com.qamar360.continuedwork.CANCEL"
    const val EXTRA_TITLE = "title"
    const val EXTRA_SUBTITLE = "subtitle"
    private const val NOTIFICATION_ID = 7301
    private const val CHANNEL_ID = "continued-work"

    @Volatile
    var onStop: ((String) -> Unit)? = null

    @Volatile
    private var running = false

    fun update(context: Context, title: String, subtitle: String, completed: Int, total: Int) {
      if (!running) return
      context.getSystemService(NotificationManager::class.java)
        ?.notify(NOTIFICATION_ID, notification(context, title, subtitle, completed, total))
    }

    @SuppressLint("DiscouragedApi")
    private fun notification(context: Context, title: String, subtitle: String, completed: Int, total: Int): Notification {
      val manager = context.getSystemService(NotificationManager::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager?.getNotificationChannel(CHANNEL_ID) == null) {
        manager?.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Writing reflections", NotificationManager.IMPORTANCE_LOW)
        )
      }
      // The expo-notifications plugin ships the monochrome app mark under this name.
      val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
        .takeIf { it != 0 } ?: context.applicationInfo.icon
      val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      val cancel = PendingIntent.getService(
        context,
        0,
        Intent(context, ContinuedWorkService::class.java).setAction(ACTION_CANCEL),
        flags
      )
      val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        PendingIntent.getActivity(context, 0, it, flags)
      }
      return NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(icon)
        .setContentTitle(title)
        .setContentText(subtitle)
        .setContentIntent(open)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .setProgress(total, completed, total <= 0)
        .addAction(0, "Cancel", cancel)
        .build()
    }
  }
}
