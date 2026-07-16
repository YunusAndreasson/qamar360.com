import { ActivityIndicator, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'destructive';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode;
  variant?: Variant;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppButton({ children, variant = 'primary', busy, disabled, style, ...props }: Props) {
  const theme = useTheme();
  const isDisabled = !!disabled || !!busy;

  const backgroundColor = isDisabled
    ? theme.backgroundSelected
    : variant === 'primary'
      ? theme.accent
      : variant === 'destructive'
        ? theme.dangerSubtle
        : 'transparent';
  const color = isDisabled
    ? theme.textDisabled
    : variant === 'primary'
      ? theme.accentText
      : variant === 'destructive'
        ? theme.danger
        : theme.textSecondary;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: !!busy }}
      disabled={isDisabled}
      android_ripple={{ color: variant === 'primary' ? theme.rippleOnFill : theme.backgroundSelected }}
      style={[styles.button, variant === 'secondary' && styles.secondary, { backgroundColor }, style]}
      {...props}>
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText type={variant === 'secondary' ? 'default' : 'defaultSemiBold'} style={{ color }}>
          {children}
        </ThemedText>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.button,
    // minHeight drives the height to a sleek 48 (text line-height 24 + Spacing.two top/bottom
    // = 40, so minHeight wins); the padding only takes over if Dynamic Type grows the label.
    minHeight: 48,
    minWidth: 160,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    minHeight: 44,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
