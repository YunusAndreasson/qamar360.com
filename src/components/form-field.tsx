import { useId, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { FieldLabel } from '@/components/field-label';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { Ref } from 'react';

type Props = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  /**
   * Take the remaining height of a flexed parent instead of sizing to the text — for a screen
   * whose one field IS the screen (the daily reflection). The input's own wrapper has to carry
   * the flex too, which is why this is a prop and not something `style` can express: `style`
   * lands on the `TextInput`, and a `TextInput` cannot stretch a parent that doesn't flex.
   *
   * The parent must actually offer height — a `FormScreen` needs `contentContainerStyle`
   * `flexGrow: 1` — or this reduces to the field's own `minHeight`.
   */
  fill?: boolean;
  ref?: Ref<TextInput>;
};

export function FormField({ label, hint, error, fill, style, ref, secureTextEntry, onFocus, onBlur, ...props }: Props) {
  const theme = useTheme();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const fieldLabel = label ?? props.placeholder;

  return (
    <>
      {fieldLabel ? <FieldLabel nativeID={id}>{fieldLabel}</FieldLabel> : null}
      <View style={[styles.field, fill && styles.fill]}>
        <TextInput
          {...props}
          ref={ref}
          accessibilityLabel={props.accessibilityLabel ?? fieldLabel}
          accessibilityLabelledBy={fieldLabel ? id : undefined}
          accessibilityHint={error ?? hint ?? props.accessibilityHint}
          secureTextEntry={secureTextEntry && !visible}
          onFocus={(event) => { setFocused(true); onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); onBlur?.(event); }}
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: error ? theme.danger : focused ? theme.accent : theme.border },
            secureTextEntry && styles.password,
            fill && styles.fill,
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
  fill: { flex: 1 },
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
