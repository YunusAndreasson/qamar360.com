package com.qamar360.continuedwork

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Keeps a job the person started running when the app is backgrounded, as a dataSync foreground
 * service whose notification shows the progress. One job at a time.
 */
class ContinuedWorkModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ContinuedWork")

    Events("onStop")

    OnCreate {
      ContinuedWorkService.onStop = { reason -> sendEvent("onStop", mapOf("reason" to reason)) }
    }

    OnDestroy {
      ContinuedWorkService.onStop = null
    }

    Function("isSupported") {
      true
    }

    AsyncFunction("begin") { title: String, subtitle: String ->
      val intent = Intent(context, ContinuedWorkService::class.java)
        .setAction(ContinuedWorkService.ACTION_START)
        .putExtra(ContinuedWorkService.EXTRA_TITLE, title)
        .putExtra(ContinuedWorkService.EXTRA_SUBTITLE, subtitle)
      // Throws if the app is already in the background. That rejects the promise, and the job
      // stays a foreground-only one.
      ContextCompat.startForegroundService(context, intent)
    }

    Function("update") { title: String, subtitle: String, completed: Int, total: Int ->
      ContinuedWorkService.update(context, title, subtitle, completed, total)
    }

    Function("end") { _: Boolean ->
      context.stopService(Intent(context, ContinuedWorkService::class.java))
    }
  }
}
