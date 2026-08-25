import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect, useEffectEvent } from 'react';
import { AppState, Platform } from 'react-native';

import { FontWeight } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { HabitsProvider, useHabits } from '@/hooks/use-habits';
import { TasksProvider, useTasks } from '@/hooks/use-tasks';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { latestReadingId } from '@/lib/insights';
import { setAppBadgeCount } from '@/lib/notifications';
import { usePreference } from '@/lib/preferences';

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
  return (
    <HabitsProvider>
      <TasksProvider>
        <Tabs />
      </TasksProvider>
    </HabitsProvider>
  );
}

function Tabs() {
  // `useTheme()` (not the bare OS scheme) so the native tab bar follows the in-app
  // appearance override too — otherwise it stays on the system theme.
  const colors = useTheme();
  const scheme = useEffectiveScheme();
  const pathname = usePathname();
  // What the day still asks of you, counted in **units**: one per unsealed stack (never one per
  // act inside it — the stack is what you do and seal), one per open exchange, one per task still
  // on the list. Summed here because it is the one place both providers are in view.
  const { remainingToday, today, habits, setViewDate } = useHabits();
  const { openToday } = useTasks();
  const { user } = useAuth();
  const remaining = remainingToday + openToday;

  // Whether a moon quarter has closed since the user last opened Insights. Which quarter that is
  // comes from the calendar alone ({@link latestReadingId}) — no fetch, so the tab bar costs
  // nothing — and the screen stamps the preference when it is looked at. Held back until there
  // is at least one habit: a dot promising a reading of a record that doesn't exist is a lie.
  const seenReading = usePreference('insightsSeen');
  const latestReading = latestReadingId(today);
  const unread = habits.length > 0 && latestReading !== null && latestReading !== seenReading;

  // Keep the home-screen app-icon badge on the same number as the tab badge. Nothing else writes
  // it — a firing lunar update carries no `badge`. Zeroed on unmount too: leaving the authed tree
  // (sign-out) must not leave the previous user's count sitting on the icon at the sign-in screen.
  useEffect(() => {
    void setAppBadgeCount(user ? remaining : 0);
  }, [user, remaining]);
  useEffect(
    () => () => {
      void setAppBadgeCount(0);
    },
    [],
  );
  // Re-assert on every foreground, not just when `remaining` itself changes: the OS owns this
  // number once set, and can hold a stale one across a background stretch (a backfilled day
  // left `remaining` momentarily wrong before this session ever saw the correction, a lunar
  // update fired while backgrounded, or the launcher simply didn't apply an earlier write) — the
  // in-app tab badge always reads live, so only the icon can drift.
  //
  // An Effect Event, so the listener is registered ONCE. Reading `remaining` reactively meant
  // every seal, every task tick and every day-step tore the AppState subscription down and put
  // an identical one back — the exact churn `useEffectEvent` exists to remove.
  const reassertBadge = useEffectEvent(() => {
    void setAppBadgeCount(user ? remaining : 0);
  });
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reassertBadge();
    });
    return () => sub.remove();
  }, []);

  return (
    <NativeTabs
      // Keep the tab bar always visible — don't let iOS 26 minimize/hide it on scroll
      // (its default is `automatic`, which does minimize). Android ignores this.
      minimizeBehavior="never"
      // iOS gets a translucent system material (content blurs through it) instead of a solid
      // fill — the native tab-bar look. We pick the light/dark variant from the *effective*
      // scheme so it tracks the in-app appearance override, not just the OS. Android has no
      // glass, so it keeps the themed solid background.
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
          // itself: a press that is really "come back to this tab" from Insights should land you
          // where you left off, and one arriving while a sheet is open is that sheet's to handle.
          tabPress: () => {
            if (pathname === '/habits') setViewDate(today);
          },
        }}>
        {/* How much of the day is still open — a quiet nudge from any tab. Hidden at zero. */}
        {remaining > 0 ? <Trigger.Badge>{String(remaining)}</Trigger.Badge> : null}
        {/* "Today", not "Habits": the screen holds stacks, exchanges and to-dos, and only one of
            those is a habit in the ordinary sense. The route is still `habits` (renaming it would
            churn every pathname for nothing) — this is the label the user reads, and it has always
            matched that screen's own title. */}
        <Trigger.Label>Today</Trigger.Label>
        {Platform.OS === 'ios' ? (
          <Trigger.Icon sf="sun.max.fill" />
        ) : (
          <Trigger.Icon src={<Trigger.VectorIcon family={MaterialIcons} name="wb-sunny" />} />
        )}
      </Trigger>
      {/* Second, and carrying the moon — because the moon came with it. Progress held this slot
          and this glyph while the orbit lived there; the orbit is now the head of Insights, so a
          finger aimed at the moon still lands on the moon. */}
      <Trigger name="insights">
        {/* A dot, never a count. There is only ever one thing to say — a new quarter has closed —
            and a number here would read as a backlog to clear. */}
        {unread ? <Trigger.Badge>{' '}</Trigger.Badge> : null}
        <Trigger.Label>Insights</Trigger.Label>
        {Platform.OS === 'ios' ? (
          <Trigger.Icon sf="moon.fill" />
        ) : (
          <Trigger.Icon src={<Trigger.VectorIcon family={MaterialIcons} name="dark-mode" />} />
        )}
      </Trigger>
      <Trigger name="progress">
        <Trigger.Label>Progress</Trigger.Label>
        {Platform.OS === 'ios' ? (
          <Trigger.Icon sf="chart.xyaxis.line" />
        ) : (
          <Trigger.Icon src={<Trigger.VectorIcon family={MaterialIcons} name="show-chart" />} />
        )}
      </Trigger>
      <Trigger name="settings">
        <Trigger.Label>Settings</Trigger.Label>
        {Platform.OS === 'ios' ? (
          <Trigger.Icon sf="gearshape.fill" />
        ) : (
          <Trigger.Icon src={<Trigger.VectorIcon family={MaterialIcons} name="settings" />} />
        )}
      </Trigger>
    </NativeTabs>
  );
}
