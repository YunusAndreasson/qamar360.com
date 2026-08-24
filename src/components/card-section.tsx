import { StyleSheet, View } from 'react-native';

import { SectionLabel } from '@/components/section-label';
import { SeparatedRows } from '@/components/separated-rows';
import { Surface } from '@/components/surface';
import { Spacing } from '@/constants/theme';

import type { ReactNode } from 'react';

/**
 * One captioned card of the day — the shape `TO DO`, `HABITS` and `EXCHANGES` all wear.
 *
 * The three sections used to each carry this preamble and an identical `styles.section`, with a
 * paragraph in each file re-explaining the same 16pt inset. The inset is here now, said once: it
 * is the gutter `DragGrid` gives the stack cards, and these sections sit *outside* the drag layer
 * (nothing here has a slot in the day's order to be dragged into), so they have to reproduce the
 * alignment rather than inherit it — or the card edges would step in and out down the day.
 *
 * The caption's own 16 then lands it 32 in from the screen edge, the indent every section caption
 * in the app keeps.
 *
 * Settings uses {@link SettingsSection} instead: same rows, same rule, but no inset of its own
 * (`AppScreen`'s padded content already supplies one) and a caption *below* the card rather than
 * a row inside it.
 */
export function CardSection({ label, topGap, trailing, children }: {
  /** The caption above the card. Pass an already-uppercased string, like {@link SectionLabel}. */
  label: string;
  /** Space above the caption. The SCREEN owns it: the break between two units is one number, and
   *  only the screen knows what this section follows. */
  topGap: number;
  /** A closing row inside the card — see {@link SeparatedRows}. */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={[styles.section, { paddingTop: topGap }]}>
      <SectionLabel>{label}</SectionLabel>
      <Surface>
        <SeparatedRows trailing={trailing}>{children}</SeparatedRows>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  // `gap` is caption → card, at the same 8pt beat every section on the day keeps. The horizontal
  // inset is the drag grid's gutter, reproduced — see the component's doc.
  section: { gap: Spacing.two, paddingHorizontal: Spacing.three },
});
