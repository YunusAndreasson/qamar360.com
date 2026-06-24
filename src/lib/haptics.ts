/**
 * Thin, fire-and-forget wrapper over `expo-haptics`.
 *
 * Callers don't `await` taps — feedback should be immediate and a failed buzz
 * must never surface as an error or an unhandled rejection. Each helper is a
 * named *intent* (not a raw feedback style) so the tactile vocabulary stays
 * consistent across the app and is tuned in one place.
 *
 * Haptics are a no-op on web (the browser Vibration API is unreliable and adds
 * console noise); on Android they're simulated via the system vibrator, so they
 * may be imperceptible on an emulator but are safe to call.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

/** Run a haptic without awaiting it and swallow any failure. */
function fire(run: () => Promise<void>) {
  if (!enabled) return;
  void run().catch(() => {
    // A device without a haptic engine (or a denied vibrate permission) is fine —
    // the feedback is purely additive.
  });
}

export const haptics = {
  /** A habit was ticked off — a solid, satisfying single tap. */
  completed: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** A habit was un-ticked — a lighter, "undo" tap. */
  uncompleted: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** The day's last open habit was completed — a celebratory success buzz. */
  celebrate: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A discrete selection changed (weekday, appearance segment, drag pickup). */
  selection: () => fire(() => Haptics.selectionAsync()),
};
