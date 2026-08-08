import { Stack } from 'expo-router';

import { AppScreen } from '@/components/app-screen';
import { GuideBody, GuideOpening } from '@/components/guide-body';
import type { Guide } from '@/constants/guides';

/**
 * A guide on a screen of its own — reached from Settings → Guide, and from the two from-scratch
 * forms (`stack-new`, `exchange`), which can be arrived at without passing a library.
 *
 * It scrolls, which the old `fitToContents` sheet could not. That sheet is why both guides were
 * four short paragraphs with no room for a photograph or a citation on its own line: the copy was
 * shaped by its container. Same body {@link GuideIntro} shows inline; only the frame differs.
 *
 * The title is set here rather than in the four `_layout` entries, so it stays single-sourced from
 * the guide data (the same thing `habit-editor.tsx` does with "New act" / "Edit act"). No title in
 * the content itself: repeating it under the photograph would put a third heading in competition
 * with the lede.
 */
export function GuideScreen({ guide }: { guide: Guide }) {
  return (
    <AppScreen>
      <Stack.Screen options={{ title: guide.title }} />
      <GuideOpening guide={guide} />
      <GuideBody sections={guide.sections} />
    </AppScreen>
  );
}
