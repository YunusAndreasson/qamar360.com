import { usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useEffect, useEffectEvent } from 'react';
import { AppState, Platform } from 'react-native';

import { FontWeight } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { DayRecordProvider } from '@/hooks/use-day-record';
import {
  HabitsProvider,
  useHabitsNavigation,
  useHabitsSummary,
} from '@/hooks/use-habits';
import { TasksProvider, useTasksSummary } from '@/hooks/use-tasks';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { setAppBadgeCount } from '@/lib/notifications';

const { Trigger } = NativeTabs;

// Default tab when entering the group at "/". `anchor` matches the route folder
// name ("habits" → the Habits stack).
export const unstable_settings = { anchor: 'habits' };

export default function TabsLayout() {
  // `HabitsProvider` is hoisted to the tab-group root (it used to wrap only the Habits
  // stack) so the tab bar can read a live "remaining today" count for the badge, and so
  // the Habits list and its editor/stack-editor modals all share this one provider instance.
  //
  // `TasksProvider` nests inside it: the day itself (viewDate, today, the midnight rollover) and
  // the habits state a closing day is judged against both live in the habits provider, so tasks
  // has to sit underneath to read them.
  //
  // `DayRecordProvider` sits right under the habits one: each reachable day's completion, for the
  // week bar on Today, read once and then kept current from the viewed day's own sets.
  return (
    <HabitsProvider>
      <DayRecordProvider>
        <TasksProvider>
          <Tabs />
          <AppIconBadge />
        </TasksProvider>
      </DayRecordProvider>
    </HabitsProvider>
  );
}

function Tabs() {
  // `useTheme()` (not the bare OS scheme) so the native tab bar follows the in-app
  // appearance override too — otherwise it stays on the system theme.
  const colors = useTheme();
  const scheme = useEffectiveScheme();
  const pathname = usePathname();
  // Navigation needs the live calendar but not completion state; the badge needs only the count.
  // Both are narrow summaries, so a tick that doesn't change the number never reaches this tree.
  const { today, setViewDate } = useHabitsNavigation();
  const remaining = useRemainingToday();

  return (
    <NativeTabs
      labelVisibilityMode="labeled"
      // iOS 26+ shrinks the tab bar to a pill while you read down a list, and restores it the
      // moment you scroll back up — UIKit finds the screen's primary scroll view itself, which
      // every tab root here is (`AppScreen` returns its `ScrollView` as the screen's direct
      // child). **This reverses `dbdb319`'s `"never"`**, which pinned the bar open: on a screen
      // whose whole point is a long column the bar was permanent chrome over the practice.
      // `onScrollDown` rather than `automatic` so the trigger is stated rather than inherited.
      // Android has no equivalent and ignores this; there is a JS direction-reader in
      // ../open-arabic (`useTabBarAutoHide`) if the two platforms should ever match.
      minimizeBehavior="onScrollDown"
      // iOS gets a translucent system material (content blurs through it) instead of a solid
      // fill — the native tab-bar look — in the light/dark variant of the *effective* scheme.
      // That only reaches iOS 18–25: on iOS 26 the system draws the bar's glass and ignores this
      // prop, and what keeps that bar on the in-app appearance is the window override the
      // preferences store applies (`Appearance.setColorScheme`). Android has no glass, so it keeps
      // the themed solid background.
      blurEffect={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
      backgroundColor={Platform.OS === 'ios' ? undefined : colors.background}
      // The badge in the app's own steel — the platform default is alarm-red, which made the
      // remaining-count the loudest element in a near-greyscale UI (and a daily guilt signal).
      badgeBackgroundColor={colors.accent}
      badgeTextColor={colors.accentText}
      tintColor={colors.text}
      iconColor={{ default: colors.textSecondary, selected: colors.text }}
      // Tab labels DELIBERATELY stay in the system font (NativeTabsLabelStyle does accept
      // fontFamily): the tab bar is the one surface that should feel like the OS, not the
      // app voice.
      labelStyle={{
        default: { color: colors.textSecondary },
        selected: { color: colors.text, fontWeight: FontWeight.semibold },
      }}
      indicatorColor={colors.backgroundSelected}>
      <Trigger
        name="habits"
        listeners={{
          // Pressing "Today" while Today is already what you are looking at means *today* — the
          // tab is named for a day, and it was the one way back to it. The stepper only walks one
          // day per tap, each of which remounts the whole list, so returning from a backfill three
          // weeks back was twenty-one taps and no other route home. Guarded on being at the list
          // itself: a press that is really "come back to this tab" from another tab should land you
          // where you left off, and one arriving while a sheet is open is that sheet's to handle.
          tabPress: () => {
            if (pathname === '/habits') setViewDate(today);
          },
        }}>
        {/* How much of the day is still open — a quiet nudge from any tab. Hidden at zero. It
            must be written right here: a Trigger's children are read as options, never rendered,
            and anything that isn't Badge/Label/Icon is dropped — a wrapper component around the
            badge never mounts, so the badge (and anything it did) silently disappears. */}
        {remaining > 0 ? <Trigger.Badge>{String(remaining)}</Trigger.Badge> : null}
        {/* "Today", not "Habits": the screen holds stacks, exchanges and to-dos, and only one of
            those is a habit in the ordinary sense. The route is still `habits` (renaming it would
            churn every pathname for nothing) — this is the label the user reads, and it has always
            matched that screen's own title. */}
        <Trigger.Label>Today</Trigger.Label>
        <Trigger.Icon sf="sun.max.fill" md="wb_sunny" />
      </Trigger>
      <Trigger name="progress">
        <Trigger.Label>Progress</Trigger.Label>
        {/* The moon beside Today's sun: Progress is the month, and the month here is lunar. */}
        <Trigger.Icon sf="moon.fill" md="dark_mode" />
      </Trigger>
      <Trigger name="settings">
        <Trigger.Label>Settings</Trigger.Label>
        <Trigger.Icon sf="gearshape.fill" md="settings" />
      </Trigger>
    </NativeTabs>
  );
}

/** What the day still asks of you, counted in **units**: one per unsealed stack, one per open
 *  exchange, one per open task. Both providers' narrow summaries, so it changes only with the count. */
function useRemainingToday(): number {
  const { remainingToday } = useHabitsSummary();
  const { openToday } = useTasksSummary();
  return remainingToday + openToday;
}

/** Keeps the home-screen app-icon badge on the same number as the tab badge. Nothing else writes
 *  it. A sibling of the navigator rather than a Trigger child, which would never mount. */
function AppIconBadge() {
  const remaining = useRemainingToday();
  const { user } = useAuth();

  // Zeroed on unmount so sign-out cannot leave the previous user's count on the icon.
  useEffect(() => {
    void setAppBadgeCount(user ? remaining : 0);
  }, [user, remaining]);
  useEffect(
    () => () => {
      void setAppBadgeCount(0);
    },
    [],
  );

  // Re-assert on every foreground. The Effect Event keeps the listener registered once while
  // reading the latest count at the event seam.
  const reassertBadge = useEffectEvent(() => {
    void setAppBadgeCount(user ? remaining : 0);
  });
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reassertBadge();
    });
    return () => sub.remove();
  }, []);

  return null;
}
