import { useId, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { FieldLabel } from '@/components/field-label';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { Ref } from 'react';

type Props = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  ref?: Ref<TextInputInstance>;
};

export function FormField({ label, hint, error, style, ref, secureTextEntry, onFocus, onBlur, ...props }: Props) {
  const theme = useTheme();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  // The caption comes from `label` alone. It used to fall back to the placeholder, which turned
  // every placeholder-only field into a captioned one — the habit editor's count row grew "3" and
  // "unit — e.g. pages, cups" as captions wedged between its two boxes. A field that wants a
  // caption names one; the placeholder still names the field to a screen reader.
  return (
    <>
      {label ? <FieldLabel nativeID={id}>{label}</FieldLabel> : null}
      <View style={styles.field}>
        <TextInput
          {...props}
          ref={ref}
          accessibilityLabel={props.accessibilityLabel ?? label ?? props.placeholder}
          accessibilityLabelledBy={label ? id : undefined}
          accessibilityHint={error ?? hint ?? props.accessibilityHint}
          secureTextEntry={secureTextEntry && !visible}
          onFocus={(event) => { setFocused(true); onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); onBlur?.(event); }}
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: error ? theme.danger : focused ? theme.accent : theme.border },
            secureTextEntry && styles.password,
            style,
          ]}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            accessibilityState={{ expanded: visible }}
            onPress={() => setVisible((value) => !value)}
            style={styles.visibility}>
            <ThemedText type="smallBold" themeColor="accent">{visible ? 'Hide' : 'Show'}</ThemedText>
          </Pressable>
        ) : null}
      </View>
      {error || hint ? (
        <ThemedText type="small" accessibilityLiveRegion="polite" role={error ? 'alert' : undefined} style={[styles.hint, { color: error ? theme.danger : theme.textSecondary }]}>
          {error ?? hint}
        </ThemedText>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: { position: 'relative' },
  password: { paddingRight: 80 },
  visibility: { position: 'absolute', right: 0, top: 0, bottom: 0, minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  input: {
    // A comfortably large 18pt — the app can afford it and it reads better on iOS. Deliberately
    // NO `lineHeight`: an explicit lineHeight on an iOS TextInput clips the glyph box — the tops of
    // ascenders and the app's Arabic diacritics (ā ḥ ṣ ʿ) get cut off. Let the font set its own,
    // and let the vertical padding (not a fixed height) size the field so nothing is clipped.
    fontSize: 18,
    borderRadius: Radius.control,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  hint: { marginTop: Spacing.one },
});
