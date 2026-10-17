import { StyleSheet, View } from 'react-native';

import { SectionLabel } from '@/components/section-label';
import { SeparatedRows } from '@/components/separated-rows';
import { Surface } from '@/components/surface';
import { Spacing } from '@/constants/theme';

import type { ReactNode } from 'react';

/**
 * The day's vertical rhythm: every section caption on Today stands this far below whatever is
 * above it, so no section can drift from its neighbours. The widest step in the 8/16/32 scale,
 * because what follows is not another card in the same sequence but a different unit of tracking,
 * with its own caption.
 *
 * The first section takes it too. It once took 16, as the lead under the title; then the week bar
 * came between them, and a to-do list 16 under the week and 32 over the stacks read as the week's
 * own list rather than the first of the day's. The week belongs to the header (8 under the title,
 * no caption); the sections below it are the day's, and each stands as far from the week as from
 * the next. With one number for every section, the section keeps it; the stacks' caption and the
 * first-run offer, which are not `CardSection`s, read it from here.
 */
export const SECTION_BREAK = Spacing.five;

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
export function CardSection({ label, trailing, children }: {
  /** The caption above the card. Pass an already-uppercased string, like {@link SectionLabel}. */
  label: string;
  /** A closing row inside the card — see {@link SeparatedRows}. */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
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
  section: { gap: Spacing.two, paddingTop: SECTION_BREAK, paddingHorizontal: Spacing.three },
});
