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
 * On iOS the impact *style* is a character axis, not just a volume knob (the full
 * `UIImpactFeedbackGenerator` range — Light/Medium/Heavy for mass, Rigid/Soft for elasticity):
 *
 *   Rigid  — a state committed (tick, add): crisp and precise, a check clicking into place
 *   Soft   — a state released (untick, remove): rounded and muted, the undo counterpart
 *   Medium — a physical lift (drag pickup): the weight of the row in the fingers
 *   Light  — a gentle landing (drag drop): setting the row down is lighter than lifting it
 *
 * So commit/release and lift/land are distinguished by *texture*, not merely amplitude — the
 * same axis the animations use (a crisp check draw vs. a quiet dissolve, a swelling lift vs.
 * a settling spring), which is what keeps touch and motion feeling like one event.
 *
 * Per platform: iOS drives the Taptic Engine generators (selection / impact / notification);
 * Android uses the action-oriented `HapticFeedbackConstants` via `performAndroidHapticsAsync`
 * — Expo's recommended path, because it renders authentic per-device effects, honours the
 * user's system touch-feedback setting, and needs no `VIBRATE` permission. Calls are
 * fire-and-forget and a no-op on web (no reliable browser haptics).
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { Tick } from '@/constants/motion';
import { getPreference } from '@/lib/preferences';

const isIOS = Platform.OS === 'ios';
const isAndroid = Platform.OS === 'android';
const A = Haptics.AndroidHaptics;

/**
 * An Android constant, the API level that introduced it, and the constant used below that level.
 *
 * expo-haptics resolves the constant by reflection and rejects when the OS predates it, and {@link run}
 * swallows the rejection. So without a floor an intent on `Confirm`, `Reject` or `Gesture_End` (API 30),
 * or on `Segment_Tick`, `Toggle_On`, `Toggle_Off` or `Drag_Start` (API 34), is silent on every older
 * phone the app installs on (minSdk 24, Android 7). A fallback must come from the set every level has
 * (`Clock_Tick`, `Context_Click`, `Keyboard_Tap`, `Long_Press`, `Virtual_Key`), or it fails the same way.
 */
type AndroidHaptic = { type: Haptics.AndroidHaptics; since: number; fallback: Haptics.AndroidHaptics };

const floor = (type: Haptics.AndroidHaptics, since: number, fallback: Haptics.AndroidHaptics): AndroidHaptic => ({
  type,
  since,
  fallback,
});

/** A constant every API level has. */
const always = (type: Haptics.AndroidHaptics): AndroidHaptic => floor(type, 0, type);

/** The Android call for an intent. `Platform.Version` is the SDK_INT integer there; read per call. */
function android({ type, since, fallback }: AndroidHaptic) {
  return () => Haptics.performAndroidHapticsAsync(Number(Platform.Version) >= since ? type : fallback);
}

/** Run a haptic without awaiting it, swallowing any failure. The engine being silenced
 *  (Low Power Mode, the camera active, the system setting off, an unsupported actuator)
 *  is expected — the feedback is purely additive.
 *
 *  Every intent above funnels through here, so the user's "Haptics" preference is honoured by
 *  one early return rather than a check at each of the dozen call sites. */
function run(fn: () => Promise<void>) {
  if (!isIOS && !isAndroid) return; // web: no reliable haptics
  if (!getPreference('haptics')) return;
  void fn().catch(() => {});
}

/** One semantic intent → the right native call on each platform (see file header). */
function intent(ios: () => Promise<void>, androidHaptic: AndroidHaptic) {
  return () => run(isAndroid ? android(androidHaptic) : ios);
}

export const haptics = {
  /** A discrete value changed within a series — a weekday, the appearance segment, a stack's members. */
  selection: intent(() => Haptics.selectionAsync(), floor(A.Segment_Tick, 34, A.Clock_Tick)),
  /** A row was picked up to be dragged into a new order — the weight of the lift. */
  pickup: intent(
    () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    floor(A.Drag_Start, 34, A.Long_Press),
  ),
  /** A dragged row landed in its new place — fired as the settle spring completes, so the
   *  touch-down is felt at the exact frame the ghost visually lands. Lighter than the pickup:
   *  setting something down is gentler than lifting it. A cancelled drag stays silent —
   *  nothing changed, so nothing confirms. */
  drop: intent(
    () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    floor(A.Gesture_End, 30, A.Virtual_Key),
  ),
  /**
   * The month's stripe moved on since it was last seen, and has just landed where it now is
   * (Progress, on arrival). A gentle landing, the same Light texture as a dropped row and the same
   * meaning: something set down where it belongs. It confirms the acts that moved it, not the
   * navigation, so it never fires on a stripe that is where it was, or that moved back.
   */
  orbitLanded: intent(
    () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    floor(A.Gesture_End, 30, A.Virtual_Key),
  ),
  /** The month's whole orbit closed, felt the first time it is seen closed, as the glint sets off
   *  round the ring. */
  orbitClosed: intent(
    () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    floor(A.Confirm, 30, A.Virtual_Key),
  ),
  /** Scrubbing the year across a month that closed its whole orbit — the commit texture, so a month
   *  kept is felt as one, where every other month gives the plain {@link selection} tick. */
  keptMonth: intent(
    () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
    floor(A.Toggle_On, 34, A.Virtual_Key),
  ),
  /** A habit was ticked off — a crisp, precise click as the check sets. */
  completed: intent(
    () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
    floor(A.Toggle_On, 34, A.Virtual_Key),
  ),
  /** A habit was un-ticked — the rounded, muted "release" counterpart. */
  uncompleted: intent(
    () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
    floor(A.Toggle_Off, 34, A.Clock_Tick),
  ),
  /** A curated habit or stack was added to the user's own list — the same crisp "commit"
   *  texture as {@link completed}: on Discover as on Today, saying yes feels identical. */
  added: intent(
    () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
    floor(A.Confirm, 30, A.Virtual_Key),
  ),
  /** A just-added curated habit was removed again — the soft "release" counterpart to {@link added}. */
  removed: intent(
    () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
    floor(A.Reject, 30, A.Long_Press),
  ),
  /** A toast's Undo reversed the commit that just buzzed — the same Soft "release" texture as
   *  {@link removed}/{@link uncompleted}, its own name so call sites read by intent: every
   *  committed change that confirms with a haptic un-commits with its counter-texture. */
  undo: intent(
    () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
    floor(A.Toggle_Off, 34, A.Clock_Tick),
  ),
  /**
   * The day's last open habit was completed — the ring closes. The single celebratory moment, and
   * it carries the weight of tonight's moon (`illumination` 0–1): the quietest tap on a new-moon
   * night, the richer "success" beat through the month, and a rounder, weightier double-beat toward
   * the full moon (laylat al-badr). So finishing the day literally has the heft of the moon.
   */
  celebrate: (illumination = 0.5) => {
    if (illumination < 0.34) {
      // New-moon nights — the quietest close. Light, not Soft: Soft is the vocabulary's
      // "release" texture (untick/remove), and the quietest celebration must still not
      // share a pattern with an undo.
      run(
        isAndroid
          ? android(floor(A.Toggle_On, 34, A.Virtual_Key))
          : () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      );
      return;
    }
    run(
      isAndroid
        ? android(floor(A.Confirm, 30, A.Virtual_Key))
        : () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    );
    if (illumination > 0.66) {
      // Toward the full moon — a rounder, weightier tail beat, timed to `Tick.sweep` so it
      // lands at the exact moment the last ring sweeps shut on screen (see constants/motion).
      setTimeout(
        () =>
          run(
            isAndroid
              ? android(always(A.Long_Press))
              : () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
          ),
        Tick.sweep,
      );
    }
  },
  /**
   * Every act in a stack was completed — the group seals. A lesser milestone than the whole day,
   * so it's a single tail beat, not the moon-weighted {@link celebrate} sequence: the ticking act
   * has already fired its crisp Rigid {@link completed}, and a beat later — timed to `Tick.sweep`,
   * landing as the card's border blooms to full and the last ring sweeps shut — a single rounder
   * Medium pulse marks the group settling together. Heftier than one tick, lighter than the day's
   * close. When sealing the stack also closes the whole day, the day's {@link celebrate} owns the
   * moment instead (gated in use-habits), so the two never double up.
   */
  stackComplete: () =>
    setTimeout(
      () =>
        run(
          isAndroid
            ? android(always(A.Long_Press))
            : () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
        ),
      Tick.sweep,
    ),
};
