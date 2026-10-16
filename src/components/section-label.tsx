import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Tracking } from '@/constants/theme';

/**
 * The uppercase caption that labels a grouped-list section (the inset-grouped idiom used by
 * {@link SettingsSection} and the Progress/Settings screens). One treatment everywhere —
 * muted and hung 16px in from the card edge — so section headers don't drift
 * in weight or indent between screens.
 *
 * **It sets its own capitals.** Pass the caption as written ("Week starts on"); the label renders
 * it in caps. While the capitals were the caller's job, a caller that forgot was a caption that
 * whispered among shouting ones — which is exactly how a whole form drifted to sentence case.
 */
export function SectionLabel({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={[styles.label, style]}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  label: { marginLeft: Spacing.three, letterSpacing: Tracking.overline, textTransform: 'uppercase' },
});
