import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { FieldLabel } from '@/components/field-label';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { Ref } from 'react';

type Props = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  ref?: Ref<TextInput>;
};

export function FormField({ label, hint, error, style, ref, ...props }: Props) {
  const theme = useTheme();

  return (
    <>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
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
}

const styles = StyleSheet.create({
  input: {
    ...Typography.default,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  hint: { marginTop: Spacing.one },
});
