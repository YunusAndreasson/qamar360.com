import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import type { Guide, GuideSection } from '@/constants/guides';
import { Spacing } from '@/constants/theme';

/**
 * A guide's photograph and its lede — the head of the standalone screen. (The inline intro shows
 * the lede alone and keeps the photograph inside its disclosure; see `guide-intro.tsx`.)
 *
 * The photo is a `Surface`, not a bare rounded `<Image>`. These are near-black dusk interiors:
 * their corners sit around `#030305`–`#0F0F10`, and the dark theme's background is `#060910`. An
 * unbordered plate would have no edge at all in dark mode — it would read as a glow, not a card.
 * `Surface` supplies the radius, the clip, the hairline border and the lit top edge that every
 * other card on these screens already wears, so the plate belongs to the same vocabulary. It is
 * also what keeps the near-black photo from reading as a hole punched in light mode's `#F5F6F8`.
 *
 * Hidden from the accessibility tree: the lede says the thesis in words, so the photograph carries
 * no information a screen-reader user would otherwise miss, and announcing it would only delay the
 * sentence that matters.
 *
 * 3:2, baked into the asset — so `contentFit="cover"` never crops on a phone. `maxHeight` only
 * bites on a tablet, where `MaxContentWidth` (800) would otherwise give a 500pt-tall photograph;
 * there `contentPosition="top"` crops from the foot and keeps the figure's head in frame.
 */
export function GuideOpening({ guide }: { guide: Guide }) {
  return (
    <View style={styles.opening}>
      <GuidePhoto guide={guide} />
      <ThemedText type="default">{guide.lede}</ThemedText>
    </View>
  );
}

/** The photograph alone — the inline intro keeps it inside its disclosure, so the library's
 *  choices start above the fold and the picture comes with the argument it illustrates. */
export function GuidePhoto({ guide }: { guide: Guide }) {
  return (
    <Surface accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={guide.image} style={styles.photo} contentFit="cover" contentPosition="top" />
    </Surface>
  );
}

/**
 * A guide's sections, in three levels of the app's existing type ramp — no new tiers, no rules,
 * chips or accent tints.
 *
 *   heading   `defaultSemiBold` 16, `text`         — on its OWN line
 *   body      `default` 16/24, `textSecondary`
 *   evidence  `small` 14 italic, `textSecondary`
 *
 * The heading being its own line is the whole legibility change. These blocks used to run the
 * heading into the paragraph, which gave four paragraphs one texture and left nothing to scan by.
 * Splitting the citation out is the other half — a claim you might act on and a reference you read
 * once should not be the same size. The italic matches how evidence is already set on a Discover
 * preset row (`sunnah-preset-row.tsx`), and so does `textSecondary`: `textDisabled` is the
 * app's deliberate Lc-15 legibility *floor* (see `theme-contract.test.ts`), fine for an inert
 * "Already yours" chip and not fine for a sentence of Sunnah citation.
 *
 * Spacing carries the grouping — 8pt inside a section, 24pt between them — so a heading is
 * visibly bound to the paragraph it belongs to rather than floating between two.
 */
export function GuideBody({ sections }: { sections: readonly GuideSection[] }) {
  return (
    <View style={styles.body}>
      {sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <ThemedText type="defaultSemiBold">{section.heading}</ThemedText>
          <ThemedText type="default" themeColor="textSecondary">
            {section.body}
          </ThemedText>
          {section.evidence ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.evidence}>
              {section.evidence}
            </ThemedText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  opening: { gap: Spacing.three },
  photo: { width: '100%', aspectRatio: 3 / 2, maxHeight: 280 },
  body: { gap: Spacing.four },
  section: { gap: Spacing.two },
  evidence: { fontStyle: 'italic', marginTop: Spacing.half },
});
