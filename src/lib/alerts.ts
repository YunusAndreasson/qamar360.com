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
