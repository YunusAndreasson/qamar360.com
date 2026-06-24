import DateTimePicker from '@react-native-community/datetimepicker';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  visible: boolean;
  /** The currently-viewed day, as a local-midnight Date. */
  value: Date;
  /** Earliest selectable day (the backfill floor). */
  minimumDate: Date;
  /** Latest selectable day (today). */
  maximumDate: Date;
  onPick: (date: Date) => void;
  onClose: () => void;
};

/**
 * The header calendar icon's target: a native date picker to jump the viewed day.
 * Android renders the system Material calendar dialog (no chrome of our own); iOS
 * shows the native inline month calendar inside a page sheet with a Done bar.
 * Mirrors the reminder picker in `habit-editor.tsx` (same library, same events).
 */
export function DateJumpPicker({ visible, value, minimumDate, maximumDate, onPick, onClose }: Props) {
  const theme = useTheme();

  if (Platform.OS !== 'ios') {
    // The bare component pops the system dialog while mounted; unmount on result.
    if (!visible) return null;
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onChange={(event, date) => {
          onClose();
          if (event.type === 'set' && date) onPick(date);
        }}
      />
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={styles.bar}>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Done
            </ThemedText>
          </Pressable>
        </View>
        <DateTimePicker
          value={value}
          mode="date"
          display="inline"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          accentColor={theme.accent}
          onChange={(event, date) => {
            if (event.type === 'set' && date) onPick(date);
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: Spacing.two },
});
