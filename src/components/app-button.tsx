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
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      android_ripple={{ color: variant === 'primary' ? theme.rippleOnFill : theme.backgroundSelected }}
      style={[
        styles.button,
        variant === 'secondary' && styles.secondary,
        { backgroundColor },
        style,
      ]}
      {...props}>
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText type={variant === 'secondary' ? 'default' : 'defaultBold'} style={{ color }}>
          {children}
        </ThemedText>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.control,
    minHeight: 48,
    minWidth: 160,
    paddingVertical: Spacing.three,
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
