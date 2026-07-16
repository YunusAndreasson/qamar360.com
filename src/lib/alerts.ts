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
