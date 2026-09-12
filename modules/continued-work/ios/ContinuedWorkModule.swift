import ExpoModulesCore
import Foundation

/// Lets a job the person started keep running when the app is backgrounded (iOS 26 and newer),
/// with the system's Live Activity showing its progress. One job at a time.
public final class ContinuedWorkModule: Module {
  private let lock = NSLock()
  // Typed as AnyObject because ContinuedWorkSession only exists from iOS 26.
  private var session: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("ContinuedWork")

    Events("onStop")

    Function("isSupported") { () -> Bool in
      #if targetEnvironment(simulator)
        // The Simulator has no background task scheduler.
        return false
      #else
        if #available(iOS 26.0, *) {
          return true
        }
        return false
      #endif
    }

    AsyncFunction("begin") { (title: String, subtitle: String, promise: Promise) -> Void in
      guard #available(iOS 26.0, *) else {
        promise.reject("ERR_CONTINUED_WORK_UNSUPPORTED", "Continued work needs iOS 26 or newer.")
        return
      }
      let next = ContinuedWorkSession(title: title, subtitle: subtitle) { [weak self] reason in
        self?.sendEvent("onStop", ["reason": reason])
      }
      (self.replaceSession(with: next) as? ContinuedWorkSession)?.finish(success: false)
      next.start(promise)
    }

    Function("update") { (title: String, subtitle: String, completed: Int, total: Int) -> Void in
      guard #available(iOS 26.0, *) else {
        return
      }
      (self.currentSession() as? ContinuedWorkSession)?.update(
        title: title,
        subtitle: subtitle,
        completed: completed,
        total: total
      )
    }

    Function("end") { (success: Bool) -> Void in
      guard #available(iOS 26.0, *) else {
        return
      }
      (self.replaceSession(with: nil) as? ContinuedWorkSession)?.finish(success: success)
    }
  }

  private func replaceSession(with next: AnyObject?) -> AnyObject? {
    lock.lock()
    defer { lock.unlock() }
    let previous = session
    session = next
    return previous
  }

  private func currentSession() -> AnyObject? {
    lock.lock()
    defer { lock.unlock() }
    return session
  }
}
