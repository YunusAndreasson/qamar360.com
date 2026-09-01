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
 * The plan is the default answer and carries no style, so the OS gives it the emphasis; skipping
 * is the plain one. Neither is destructive: excusing a day is a legitimate move in this app and
 * must never be dressed as damage.
 */
export function confirmAgainstPlan({ plan, onSkip }: { plan: string; onSkip: () => void }) {
  Alert.alert('You planned for this', plan, [
    { text: 'I’ll do that', style: 'cancel' },
    { text: 'Skip today', onPress: onSkip },
  ]);
}
