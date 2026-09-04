import { useEffect, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { NativeDatePicker } from '@/components/native-date-picker';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { todayLocalISO } from '@/lib/dates';

export function DateNavigation({ date, today, minimum, onSelect, onStep }: {
  date: string; today: string; minimum: string;
  onSelect: (date: string) => void; onStep: (delta: number) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [pickerReady, setPickerReady] = useState(false);
  const value = new Date(`${date}T12:00:00`);
  const label = value.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const togglePicker = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPickerReady(false);
    setOpen((current) => !current);
  };
  const closePicker = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPickerReady(false);
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setPickerReady(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [open]);
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous day" disabled={date <= minimum}
          accessibilityState={{ disabled: date <= minimum }} onPress={() => onStep(-1)} style={styles.step}>
          <AppIcon name="chevronLeft" color={date <= minimum ? theme.textDisabled : theme.accent} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Choose date, ${label}`} accessibilityState={{ expanded: open }}
          onPress={togglePicker} style={styles.date}>
          <ThemedText type="smallBold">{label}</ThemedText>
          <AppIcon name="expandMore" size={16} color={theme.textSecondary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next day" disabled={date >= today}
          accessibilityState={{ disabled: date >= today }} onPress={() => onStep(1)} style={styles.step}>
          <AppIcon name="chevronRight" color={date >= today ? theme.textDisabled : theme.accent} />
        </Pressable>
      </View>
      {date !== today ? <Pressable accessibilityRole="button" onPress={() => { onSelect(today); closePicker(); }} style={styles.today}>
        <ThemedText type="smallBold" themeColor="accent">Back to today</ThemedText>
      </Pressable> : null}
      {open ? <View style={[styles.picker, { opacity: pickerReady ? 1 : 0 }]}>
        <NativeDatePicker value={value} minimumDate={new Date(`${minimum}T00:00:00`)} maximumDate={new Date(`${today}T23:59:59`)}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onValueChange={(_event, next) => { onSelect(todayLocalISO(next)); closePicker(); }} onDismiss={closePicker} />
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center' },
  step: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  date: { flex: 1, minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', gap: Spacing.two, alignItems: 'center', justifyContent: 'center' },
  today: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  picker: { overflow: 'hidden' },
});
