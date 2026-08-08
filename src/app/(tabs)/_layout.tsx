import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { FontWeight } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { HabitsProvider, useHabits } from '@/hooks/use-habits';
import { TasksProvider, useTasks } from '@/hooks/use-tasks';
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
  // What the day still asks of you, counted in **units**: one per unsealed stack (never one per
  // act inside it — the stack is what you do and seal), one per open exchange, one per task still
  // on the list. Summed here because it is the one place both providers are in view.
  const { remainingToday } = useHabits();
  const { openToday } = useTasks();
  const { user } = useAuth();
  const remaining = remainingToday + openToday;

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
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void setAppBadgeCount(user ? remaining : 0);
    });
    return () => sub.remove();
  }, [user, remaining]);

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
      <Trigger name="habits">
        {/* How much of the day is still open — a quiet nudge from any tab. Hidden at zero. */}
        {remaining > 0 ? <Trigger.Badge>{String(remaining)}</Trigger.Badge> : null}
        <Trigger.Label>Habits</Trigger.Label>
        {Platform.OS === 'ios' ? (
          <Trigger.Icon sf="sun.max.fill" />
        ) : (
          <Trigger.Icon src={<Trigger.VectorIcon family={MaterialIcons} name="wb-sunny" />} />
        )}
      </Trigger>
      <Trigger name="progress">
        <Trigger.Label>Progress</Trigger.Label>
        {Platform.OS === 'ios' ? (
          <Trigger.Icon sf="moon.fill" />
        ) : (
          <Trigger.Icon src={<Trigger.VectorIcon family={MaterialIcons} name="dark-mode" />} />
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
