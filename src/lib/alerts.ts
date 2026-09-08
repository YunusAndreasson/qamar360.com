import { Alert } from 'react-native';

/**
 * The app's one destructive-confirm dialog: a Cancel plus a single destructive action, in the
 * platform-standard order. One definition so every "delete / reset" prompt — a habit, a stack,
 * the account, the whole progress history — reads and behaves identically instead of each screen
 * re-spelling the same two-button `Alert.alert`.
 */
export function confirmDestructive({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
}: {
  title: string;
  message: string;
  /** The destructive button's label (defaults to "Delete"; e.g. "Reset"). */
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

/**
 * The same dialog with two ways through — a milder answer and a stronger one (deleting a stack
 * alone, or deleting its acts with it). The sparing option is listed first and left untinted, so
 * only the one that destroys more wears the destructive colour: iOS pins Cancel to the bottom
 * regardless, and Android reads three buttons as neutral / negative / positive left to right.
 */
export function confirmDestructiveChoice({
  title,
  message,
  keepLabel,
  onKeep,
  destroyLabel,
  onDestroy,
}: {
  title: string;
  message: string;
  /** The answer that spares something (e.g. "Keep the acts"). */
  keepLabel: string;
  onKeep: () => void;
  /** The answer that destroys more — destructive-tinted (e.g. "Delete the acts too"). */
  destroyLabel: string;
  onDestroy: () => void;
}) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: keepLabel, onPress: onKeep },
    { text: destroyLabel, style: 'destructive', onPress: onDestroy },
  ]);
}

/**
 * The dialog a goal's own plan raises, at the one moment it is for.
 *
 * Mental contrasting works by pairing the wish with the obstacle, and its practical half is the
 * if-then: a response decided in advance, before the moment that needs it. That is worth nothing
 * written on a screen you visit monthly, and worth a great deal handed back at the instant you
 * reach to skip the act it was written about — which is the only place this is ever shown.
 *
 * Order matters and is not the same on both platforms. Android lays the buttons out left to right
 * in array order and emphasises the LAST one; iOS pins `cancel` to the bottom and bolds it. So
 * skipping is listed first and the plan last, which puts the plan in the emphasised slot on
 * Android and leaves iOS's cancel handling untouched. Neither button is destructive: excusing a
 * day is a legitimate move in this app and must never be dressed as damage.
 */
export function confirmAgainstPlan({ plan, onSkip }: { plan: string; onSkip: () => void }) {
  Alert.alert('You planned for this', plan, [
    { text: 'Skip today', onPress: onSkip },
    { text: 'I’ll do that', style: 'cancel' },
  ]);
}

/**
 * A plain two-button confirm for a choice that is consequential but not destructive — nothing is
 * deleted, and the second button therefore wears no destructive tint.
 *
 * It exists for the one decision in the app that cannot be taken back by any other screen: the
 * first reading on a goal settles which way its measure travels, and a typo'd digit turns a
 * climbing goal into a falling one that reads "Reached" with its milestones marching below zero.
 * Nothing about that is damage, so `confirmDestructive` would be the wrong dialog; it is simply
 * a door that only opens one way, and doors like that are worth naming before you walk through.
 */
export function confirmProceed({
  title,
  message,
  confirmLabel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, onPress: onConfirm },
  ]);
}
