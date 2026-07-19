import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { FontWeight } from '@/constants/theme';
import { HabitsProvider, useHabits } from '@/hooks/use-habits';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';

const { Trigger } = NativeTabs;

// Default tab when entering the group at "/". `anchor` matches the route folder
// name ("habits" → the Habits stack).
export const unstable_settings = { anchor: 'habits' };

export default function TabsLayout() {
  // `HabitsProvider` is hoisted to the tab-group root (it used to wrap only the Habits
  // stack) so the tab bar can read a live "remaining today" count for the badge, and so
  // the Habits list and its editor/stack-editor modals all share this one provider instance.
  return (
    <HabitsProvider>
      <Tabs />
    </HabitsProvider>
  );
}

function Tabs() {
  // `useTheme()` (not the bare OS scheme) so the native tab bar follows the in-app
  // appearance override too — otherwise it stays on the system theme.
  const colors = useTheme();
  const scheme = useEffectiveScheme();
  // The hook's own "open today" count — the same number it puts on the OS app-icon badge,
  // so the tab badge and the home-screen badge can never disagree.
  const { remainingToday } = useHabits();

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
        {/* How many acts are still open today — a quiet nudge from any tab. Hidden at zero. */}
        {remainingToday > 0 ? <Trigger.Badge>{String(remainingToday)}</Trigger.Badge> : null}
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
