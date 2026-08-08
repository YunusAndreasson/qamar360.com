import { StyleSheet, View } from 'react-native';

import { DisclosureRow } from '@/components/disclosure-row';
import { GuideBody, GuideOpening } from '@/components/guide-body';
import type { Guide } from '@/constants/guides';
import { Spacing } from '@/constants/theme';

/**
 * A guide, embedded at the head of the library it explains.
 *
 * The reasoning used to live behind a "Why anchoring works" row in the *footer* of these screens —
 * below every card, which is to say after the decision it was meant to inform. Here it opens the
 * page: the photograph, the claim in one line, and the argument one tap away without leaving the
 * screen or losing your place among the entries.
 *
 * Collapsed by default. Someone who already knows what a stack is should not have to scroll past
 * an explanation to reach the thing they came for; someone who doesn't gets the lede for free and
 * the rest for the price of a tap.
 *
 * No in-body title — the nav bar above already says "Ready-made stacks".
 */
export function GuideIntro({ guide }: { guide: Guide }) {
  return (
    <View style={styles.intro}>
      <GuideOpening guide={guide} />
      <DisclosureRow label={guide.why} expandHint="Opens the full guide." collapseHint="Hides the guide.">
        <GuideBody sections={guide.sections} />
      </DisclosureRow>
    </View>
  );
}

const styles = StyleSheet.create({
  // `marginBottom` on top of AppScreen's own 16pt gap reproduces the 24pt of air the one-line
  // lede this replaces used to hold before the first section label.
  intro: { gap: Spacing.three, marginBottom: Spacing.two },
});
