import { GuideSheet } from '@/components/guide-sheet';
import { ThemedText } from '@/components/themed-text';

/**
 * The case for exchanges, in the same four-block shape as `StackingGuide` — a claim from the
 * research, then the Sunnah that says it first. Presented `fitToContents`; the sheet doesn't
 * scroll, so the copy stays these four short blocks.
 *
 * Reached from the exchange library and from Settings → About, alongside the stacking guide: the
 * two are halves of one idea. A stack adds a deed to the day; an exchange puts one where another
 * keeps happening.
 */
export function ExchangeGuide() {
  return (
    <GuideSheet icon="exchange" title="Exchanges">
      <ThemedText type="default">
        <ThemedText type="defaultSemiBold">Replace, don’t resist. </ThemedText>
        A plan phrased as a refusal keeps the thing it names in mind, and in trials it made the
        old habit stronger, not weaker. A plan that names something to do instead displaces it. So
        this app never asks you to tick “didn’t” — what you record is the deed.
      </ThemedText>
      <ThemedText type="default">
        The Prophet ﷺ put it in one line: follow a bad deed with a good deed and it will wipe it
        out (Tirmidhi 1987, ḥasan ṣaḥīḥ). And of those who turn back, Allah says He will replace
        their bad deeds with good ones (Qurʾān 25:70).
      </ThemedText>
      <ThemedText type="default">
        <ThemedText type="defaultSemiBold">Name the moment it hits. </ThemedText>
        Not “eat better” — “drank a glass of water instead of soft drinks, when I sit down to
        eat”. The urge arrives in a handful of very particular moments, and a plan that doesn’t
        name one has nowhere to fire. Pick something that is actually to hand when it does: the
        Prophet ﷺ told a man angry while standing to sit down (Abu Dawud 4782).
      </ThemedText>
      <ThemedText type="default">
        <ThemedText type="defaultSemiBold">A slip is not a collapse. </ThemedText>
        When this was measured, one missed day cost almost nothing — it was missing a whole week
        that predicted giving up. So a day that didn’t hold records nothing at all: no red, no
        broken streak. Take account of yourself at day’s end, mark what held, and begin again.
      </ThemedText>
    </GuideSheet>
  );
}
