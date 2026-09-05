import { router, Stack } from 'expo-router';

import { HeaderIconButton } from '@/components/header-icon-button';
import { TabStack } from '@/components/tab-stack';
import { Icons } from '@/constants/icons';
import { useTheme } from '@/hooks/use-theme';
import { modalHeaderOptions, transparentScreen } from '@/lib/header-options';

export default function InsightsStackLayout() {
  const theme = useTheme();
  return (
    <TabStack>
      <Stack.Screen
        name="index"
        options={{
          ...transparentScreen,
          title: 'Insights',
          headerLargeTitle: true,
          // The one way to set a goal, in the one place it can always be found.
          //
          // It used to be a row in the list, which moved: last row of the GOALS card once you had
          // goals, and alone at the very foot of the screen — under the whole archive of readings —
          // until then. So the reader least likely to know goals exist was the one it was hidden
          // from, and setting a first goal teleported the button they had just pressed from the
          // bottom of the screen to the top.
          //
          // A header glyph fixes both: it does not move, and it costs no vertical space at all —
          // which serves the original rule ("a goal is not chrome the app owes you; until you set
          // one the tab is exactly what it was") better than a row occupying the list did. Unlike
          // Today's `+`, which forks five ways, this one means exactly one thing, so it says so.
          headerRight: () => (
            <HeaderIconButton
              icon={Icons.add}
              color={theme.accent}
              accessibilityLabel="Set a goal"
              onPress={() => router.push('/(tabs)/insights/goal/new')}
            />
          ),
        }}
      />
      {/* The reading in full — pushed, not a sheet: it has more to say than `fitToContents` can
          hold, and it is a place you arrive at from a notification, not a footnote to this screen. */}
      <Stack.Screen name="[id]" options={transparentScreen} />
      {/* A goal, and the form that sets one. Under a static `goal/` segment rather than beside
          `[id]`, so neither route can ever be swallowed by the reading's dynamic one. */}
      <Stack.Screen name="goal/[id]" options={transparentScreen} />
      {/* The composer takes `modalHeaderOptions`, the same as every other editor form in the app
          (`habits/_layout.tsx`) — an opaque themed bar in the shared title voice. Not
          `transparentScreen`: that exists so a *list* can show the fixed sky through it, and
          `FormScreen` paints its own background and its own backdrop already. */}
      <Stack.Screen name="goal/new" options={modalHeaderOptions(theme)} />
    </TabStack>
  );
}
