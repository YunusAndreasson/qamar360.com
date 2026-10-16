import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Tracking } from '@/constants/theme';

/**
 * The muted uppercase caption above a field or group inside an editor form. Flush-left,
 * unlike {@link SectionLabel} (which is indented 16px for grouped-list cards), so the two
 * form editors don't each re-declare an ad-hoc `ThemedText` caption. Like `SectionLabel`, it sets
 * its own capitals: pass the caption as written.
 */
export function FieldLabel({ children, style, nativeID }: { children: string; style?: StyleProp<TextStyle>; nativeID?: string }) {
  return (
    <ThemedText nativeID={nativeID} type="small" themeColor="textSecondary" style={[styles.label, style]}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: Spacing.two, letterSpacing: Tracking.overline, textTransform: 'uppercase' },
});
