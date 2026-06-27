import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/**
 * The muted uppercase caption above a field or group inside an editor form. Flush-left,
 * unlike {@link SectionLabel} (which is indented 16px for grouped-list cards), so the two
 * form editors don't each re-declare an ad-hoc `ThemedText` caption. Pass an uppercase string.
 */
export function FieldLabel({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={[styles.label, style]}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: Spacing.two },
});
