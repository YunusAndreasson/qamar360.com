/**
 * The app's haptic vocabulary — named by *intent*, never by a raw feedback style, so each
 * physical sensation maps to exactly one meaning and is tuned in a single place. (Apple HIG:
 * build a clear, causal link between a haptic and its action, and don't reuse a pattern to
 * mean two different things.)
 *
 * Haptics here are deliberately sparse — they confirm a real state change or mark the day's
 * milestone, and nothing else. We never buzz for routine navigation, for disclosure
 * (expand/collapse), or for a native control (e.g. a `Switch`) that the OS already
 * vibrates for itself.
 *
 * Per platform: iOS drives the Taptic Engine generators (selection / impact / notification);
 * Android uses the action-oriented `HapticFeedbackConstants` via `performAndroidHapticsAsync`
 * — Expo's recommended path, because it renders authentic per-device effects, honours the
 * user's system touch-feedback setting, and needs no `VIBRATE` permission. Calls are
 * fire-and-forget and a no-op on web (no reliable browser haptics).
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const isIOS = Platform.OS === 'ios';
const isAndroid = Platform.OS === 'android';

/** Run a haptic without awaiting it, swallowing any failure. The engine being silenced
 *  (Low Power Mode, the camera active, the system setting off, an unsupported actuator)
 *  is expected — the feedback is purely additive. */
function run(fn: () => Promise<void>) {
  if (!isIOS && !isAndroid) return; // web: no reliable haptics
  void fn().catch(() => {});
}

/** One semantic intent → the right native call on each platform (see file header). */
function intent(ios: () => Promise<void>, android: Haptics.AndroidHaptics) {
  return () => run(isAndroid ? () => Haptics.performAndroidHapticsAsync(android) : ios);
}

export const haptics = {
  /** A discrete value changed within a series — a weekday, the appearance segment, a stack's members. */
  selection: intent(() => Haptics.selectionAsync(), Haptics.AndroidHaptics.Segment_Tick),
  /** A row was picked up to be dragged into a new order. */
  pickup: intent(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), Haptics.AndroidHaptics.Drag_Start),
  /** A habit was ticked off — a solid, satisfying confirmation. */
  completed: intent(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), Haptics.AndroidHaptics.Toggle_On),
  /** A habit was un-ticked — a lighter "undo" counterpart. */
  uncompleted: intent(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), Haptics.AndroidHaptics.Toggle_Off),
  /** A curated habit or stack was added to the user's own list. */
  added: intent(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), Haptics.AndroidHaptics.Confirm),
  /** A just-added curated habit was removed again — the lighter "undo" counterpart to {@link added}. */
  removed: intent(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), Haptics.AndroidHaptics.Reject),
  /**
   * The day's last open habit was completed — the ring closes. The single celebratory moment, and
   * it carries the weight of tonight's moon (`illumination` 0–1): the quietest tap on a new-moon
   * night, the richer "success" beat through the month, and a rounder, weightier double-beat toward
   * the full moon (laylat al-badr). So finishing the day literally has the heft of the moon.
   */
  celebrate: (illumination = 0.5) => {
    if (illumination < 0.34) {
      // New-moon nights — the quietest close.
      run(
        isAndroid
          ? () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Toggle_On)
          : () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      );
      return;
    }
    run(
      isAndroid
        ? () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
        : () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    );
    if (illumination > 0.66) {
      // Toward the full moon — a rounder, weightier tail beat.
      setTimeout(
        () =>
          run(
            isAndroid
              ? () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press)
              : () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
          ),
        130,
      );
    }
  },
};
