import { forwardRef } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
};

export const FormField = forwardRef<TextInput, Props>(function FormField({ label, hint, error, style, ...props }, ref) {
  const theme = useTheme();

  return (
    <>
      {label ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          style,
        ]}
        {...props}
      />
      {error || hint ? (
        <ThemedText type="small" style={[styles.hint, { color: error ? theme.danger : theme.textSecondary }]}>
          {error ?? hint}
        </ThemedText>
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  label: { marginTop: Spacing.two },
  input: {
    ...Typography.default,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  hint: { marginTop: Spacing.one },
});
