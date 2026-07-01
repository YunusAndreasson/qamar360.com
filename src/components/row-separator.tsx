import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The inset hairline between rows of a grouped-list card — hung past the leading padding so it
 * reads as the iOS inset-grouped rule (not a full-bleed cut). Shared by {@link SettingsSection}
 * and the stack card's member list so the divider stays one rule across every grouped list.
 */
export function RowSeparator() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.three },
});
