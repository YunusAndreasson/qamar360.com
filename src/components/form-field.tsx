import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { FieldLabel } from '@/components/field-label';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
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
    // A comfortably large 18pt — the app can afford it and it reads better on iOS. Deliberately
    // NO `lineHeight`: an explicit lineHeight on an iOS TextInput clips the glyph box — the tops of
    // ascenders and the app's Arabic diacritics (ā ḥ ṣ ʿ) get cut off. Let the font set its own,
    // and let the vertical padding (not a fixed height) size the field so nothing is clipped.
    fontSize: 18,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  hint: { marginTop: Spacing.one },
});
