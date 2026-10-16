import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Pressed, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  onCancel?: () => void;
  onSave: () => void;
  canSave: boolean;
  saveLabel?: string;
};

function headerCancelAction(onCancel?: () => void) {
  if (!onCancel) return undefined;
  return function HeaderCancel() {
    return <HeaderCancelButton onCancel={onCancel} label="Cancel" />;
  };
}

export function headerSaveAction(onSave: () => void, canSave: boolean, label = 'Save') {
  return function HeaderSave() {
    return <HeaderSaveButton onSave={onSave} canSave={canSave} label={label} />;
  };
}

/**
 * A plain dismiss button for a modal that has nothing to save — e.g. the Discover sheet, where
 * adds commit instantly. Left-aligned like every other modal's dismiss (the editors' "Cancel"),
 * so the app's sheets all close from the same place.
 */
export function headerCloseAction(onClose: () => void) {
  return function HeaderClose() {
    return <HeaderCancelButton onCancel={onClose} label="Close" />;
  };
}

/**
 * The trailing nav-bar action on a library screen: the from-scratch door, out of the scroll.
 *
 * The three libraries (Sunnah acts, ready-made stacks, ready-made exchanges) each closed with a
 * quiet "your own …" row, on the sound argument that the curated library is the primary offer and
 * the custom path should not shout over it. What that costs is reach: the row is the LAST thing on
 * a screen ~60 rows / ~10 cards deep, so the one door a returning user is most likely to want was
 * the one furthest from their thumb — and on Discover it vanished entirely the moment you typed,
 * since the search branch never renders it. An accelerator for the experienced user that is only
 * reachable by scrolling past the beginner's path is not an accelerator (Nielsen 7); and a control
 * whose availability changes with the search field is not a control anyone can rely on.
 *
 * A nav-bar action fixes reach without touching rank: it is always on screen, it costs the library
 * nothing visually, and it lands opposite the same screen's Close so the bar reads as a pair. Text
 * rather than a glyph on purpose — a bare "+" one tap after the "+" that opened the library reads
 * as the same glyph meaning something new, which is why Discover has never had one.
 *
 * The body row stays where it is: it carries the sublabel that says what you are signing up for,
 * and it is the right answer at the end of a scan that found nothing. Same destination, two
 * altitudes.
 */
export function headerNewAction(label: string, accessibilityLabel: string, onPress: () => void) {
  return function HeaderNew() {
    return <HeaderNewButton label={label} accessibilityLabel={accessibilityLabel} onPress={onPress} />;
  };
}

export function formHeaderActions({ onCancel, onSave, canSave, saveLabel }: Props) {
  return {
    headerLeft: headerCancelAction(onCancel),
    headerRight: headerSaveAction(onSave, canSave, saveLabel),
  };
}

const styles = StyleSheet.create({
  action: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.half },
  pressed: { opacity: Pressed.dim },
});

/** The bar's dismiss. Exported for the one editor that writes its own bar (the goal composer, whose
 *  save guards itself with a ref the compiler won't let pass through {@link formHeaderActions}). */
export function HeaderCancelButton({ onCancel, label, disabled = false }: { onCancel: () => void; label: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onCancel}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <ThemedText type="small" themeColor={disabled ? 'textDisabled' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function HeaderNewButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // The bar has room for one word; a screen reader has room for the sentence.
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      {/* Accent, but at `small`'s regular weight — a real action (so tinted, unlike the quiet
          `Close` opposite it), and not the bar's commit (so not `smallBold` like Save). */}
      <ThemedText type="small" style={{ color: theme.accent }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** The bar's commit. `busy` is a save in flight — paired with a "Saving…" label and a disabled
 *  Cancel, so a second tap can't write twice and Cancel can't walk away from a write mid-flight. */
export function HeaderSaveButton({ onSave, canSave, label, busy = false }: { onSave: () => void; canSave: boolean; label: string; busy?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onSave}
      disabled={!canSave}
      accessibilityRole="button"
      accessibilityState={{ disabled: !canSave, busy }}
      hitSlop={8}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <ThemedText type="smallBold" style={{ color: canSave ? theme.accent : theme.textDisabled }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}
