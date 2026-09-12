import BackgroundTasks
import ExpoModulesCore
import Foundation

/// One BGContinuedProcessingTask, from submission to completion.
///
/// The system kills the app if a task identifier is registered twice, and there is no way to
/// unregister one, so every session registers its own identifier under the wildcard declared in
/// `BGTaskSchedulerPermittedIdentifiers`.
@available(iOS 26.0, *)
final class ContinuedWorkSession {
  private static let identifierPrefix = "com.qamar360.app.reflection"
  // Submitted with the fail strategy, the task starts at once or not at all. This only guards
  // against a launch handler that never arrives.
  private static let startTimeout: TimeInterval = 10

  private let identifier = "\(ContinuedWorkSession.identifierPrefix).\(UUID().uuidString)"
  private let onStop: (String) -> Void
  private let lock = NSLock()
  private var title: String
  private var subtitle: String
  private var completedUnits: Int64 = 0
  private var totalUnits: Int64 = 100
  private var pending: Promise?
  private var task: BGContinuedProcessingTask?
  private var ended = false

  init(title: String, subtitle: String, onStop: @escaping (String) -> Void) {
    self.title = title
    self.subtitle = subtitle
    self.onStop = onStop
  }

  func start(_ promise: Promise) {
    lock.lock()
    pending = promise
    let requestTitle = title
    let requestSubtitle = subtitle
    lock.unlock()

    let registered = BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) {
      [weak self] launched in
      guard let continued = launched as? BGContinuedProcessingTask, let session = self else {
        launched.setTaskCompleted(success: false)
        return
      }
      session.attach(continued)
    }
    guard registered else {
      fail("ERR_CONTINUED_WORK_NOT_PERMITTED", "\(identifier) is not covered by BGTaskSchedulerPermittedIdentifiers.")
      return
    }

    let request = BGContinuedProcessingTaskRequest(
      identifier: identifier,
      title: requestTitle,
      subtitle: requestSubtitle
    )
    // Work that only makes sense now: never let the system queue it for later.
    request.strategy = .fail
    do {
      try BGTaskScheduler.shared.submit(request)
    } catch {
      let nsError = error as NSError
      fail("ERR_CONTINUED_WORK_SUBMIT", "\(nsError.domain) \(nsError.code): \(nsError.localizedDescription)")
      return
    }

    DispatchQueue.global().asyncAfter(deadline: .now() + ContinuedWorkSession.startTimeout) { [weak self] in
      self?.fail("ERR_CONTINUED_WORK_NOT_STARTED", "The system did not start the task.")
    }
  }

  func update(title nextTitle: String, subtitle nextSubtitle: String, completed: Int, total: Int) {
    let units = Int64(max(total, 1))
    let done = min(max(Int64(completed), 0), units)

    lock.lock()
    title = nextTitle
    subtitle = nextSubtitle
    completedUnits = done
    totalUnits = units
    let continued = task
    lock.unlock()

    guard let continued = continued else {
      return
    }
    continued.progress.totalUnitCount = units
    continued.progress.completedUnitCount = done
    continued.updateTitle(nextTitle, subtitle: nextSubtitle)
  }

  func finish(success: Bool) {
    lock.lock()
    guard !ended else {
      lock.unlock()
      return
    }
    ended = true
    let continued = task
    let promise = pending
    task = nil
    pending = nil
    lock.unlock()

    if let continued = continued {
      continued.setTaskCompleted(success: success)
    } else {
      BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: identifier)
    }
    promise?.reject("ERR_CONTINUED_WORK_ENDED", "The work ended before the task started.")
  }

  private func attach(_ continued: BGContinuedProcessingTask) {
    lock.lock()
    guard !ended, let promise = pending else {
      lock.unlock()
      continued.setTaskCompleted(success: false)
      return
    }
    pending = nil
    task = continued
    let done = completedUnits
    let units = totalUnits
    let currentTitle = title
    let currentSubtitle = subtitle
    lock.unlock()

    continued.progress.totalUnitCount = units
    continued.progress.completedUnitCount = done
    continued.updateTitle(currentTitle, subtitle: currentSubtitle)
    continued.expirationHandler = { [weak self] in
      // A person cancelling from the Live Activity and the system reclaiming resources both land here.
      self?.expire()
    }
    promise.resolve()
  }

  private func expire() {
    lock.lock()
    guard !ended else {
      lock.unlock()
      return
    }
    ended = true
    let continued = task
    task = nil
    lock.unlock()

    onStop("expired")
    continued?.setTaskCompleted(success: false)
  }

  private func fail(_ code: String, _ message: String) {
    lock.lock()
    guard let promise = pending else {
      lock.unlock()
      return
    }
    pending = nil
    ended = true
    lock.unlock()

    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: identifier)
    promise.reject(code, message)
  }
}
