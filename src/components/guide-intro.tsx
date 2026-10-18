import { StyleSheet, View } from 'react-native';

import { DisclosureRow } from '@/components/disclosure-row';
import { GuideBody, GuidePhoto } from '@/components/guide-body';
import { ThemedText } from '@/components/themed-text';
import type { Guide } from '@/constants/guides';
import { Spacing } from '@/constants/theme';

/**
 * A guide, embedded at the head of the library it explains.
 *
 * The reasoning used to live behind a "Why anchoring works" row in the *footer* of these screens —
 * below every card, which is to say after the decision it was meant to inform. Here it opens the
 * page: the claim in one line, and the argument one tap away without leaving the screen or losing
 * your place among the entries.
 *
 * Collapsed by default, and the photograph lives inside the fold with the argument. Up front it
 * stood up to 280pt tall above the first card, so on a phone the thing you came for began below
 * the fold; someone who already knows what a stack is should not have to scroll past a picture to
 * reach it. Someone who doesn't gets the lede for free and the rest, photograph included, for the
 * price of a tap. The standalone guide screen keeps the photograph at its head (`GuideOpening`).
 *
 * No in-body title — the nav bar above already says "Ready-made stacks".
 */
export function GuideIntro({ guide }: { guide: Guide }) {
  return (
    <View style={styles.intro}>
      <ThemedText type="default">{guide.lede}</ThemedText>
      <DisclosureRow label={guide.why} expandHint="Opens the full guide." collapseHint="Hides the guide.">
        <View style={styles.body}>
          <GuidePhoto guide={guide} />
          <GuideBody sections={guide.sections} />
        </View>
      </DisclosureRow>
    </View>
  );
}

const styles = StyleSheet.create({
  // `marginBottom` on top of AppScreen's own 16pt gap reproduces the 24pt of air the one-line
  // lede this replaces used to hold before the first section label.
  intro: { gap: Spacing.three, marginBottom: Spacing.two },
  body: { gap: Spacing.four },
});
