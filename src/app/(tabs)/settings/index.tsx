import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppScreen } from '@/components/app-screen';
import { Avatar } from '@/components/avatar';
import { SectionLabel } from '@/components/section-label';
import { Segmented, type SegmentedOption } from '@/components/segmented';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { SocialLinks } from '@/components/social-links';
import { ThemeSegmented } from '@/components/theme-segmented';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { APP_NAME } from '@/constants/app';
import { Links } from '@/constants/links';
import { Pressed, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useAvatar } from '@/hooks/use-avatar';
import { clearCompletionHistory } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/alerts';
import { openBrowser } from '@/lib/browser';
import { describeHijriOffset, todayLocalISO } from '@/lib/dates';
import { deviceLocation } from '@/lib/geo';
import { planLunarFires } from '@/lib/lunar-schedule';
import { lunarUpdateCopy } from '@/lib/lunar-update';
import { ensurePermission, notificationsAvailable, permissionGranted } from '@/lib/notifications';
import { setPreference, usePreference, type WeekStart } from '@/lib/preferences';

// Sunday (the app's own index origin and the US/Gulf convention), Monday (ISO and most of
// Europe), Saturday (much of the Arab world). Values are stringified weekday indices because
// `Segmented` is generic over strings — the index itself is what `weekOrder` wants back.
const WEEK_STARTS: SegmentedOption<string>[] = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '6', label: 'Saturday' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { user, signOut, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const avatar = useAvatar();

  // Every configurable preference, each defaulting to the behaviour the app shipped with — so a
  // user who never opens this screen has made no choices, and one who does can undo any of them.
  const weekStart = usePreference('weekStart');
  const hijriOffset = usePreference('hijriOffset');
  const dayBands = usePreference('dayBands');
  const lunarUpdatesOn = usePreference('lunarUpdates');
  const hapticsOn = usePreference('haptics');
  const celebrateDay = usePreference('celebrateDay');
  const skyMotion = usePreference('skyMotion');

  // The next update, named by the same generator that will actually send it — so this line
  // can't drift from what arrives. No figure is shown: that needs a progress fetch, and the
  // Progress tab is one tap away for anyone who wants the number.
  const nextUpdate = useMemo(() => {
    // Nothing is going to arrive without the OS's consent, so don't promise one.
    if (!lunarUpdatesOn || !notificationsAvailable || notifGranted !== true) return null;
    const { lat, lon } = deviceLocation();
    const [fire] = planLunarFires(todayLocalISO(), lat, lon);
    return fire ? lunarUpdateCopy(fire, null).title : null;
  }, [lunarUpdatesOn, notifGranted]);

  // Reflect the real OS permission (without prompting), so the row shows accurate
  // state rather than a "tap to…" guess. Re-read whenever the app returns to the
  // foreground too — tapping an already-granted row sends the user to iOS Settings,
  // and the label must update if they toggle the permission while they're there.
  useEffect(() => {
    const refresh = () => void permissionGranted().then(setNotifGranted);
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, []);

  // And on regaining focus: the lunar-updates sheet asks for the permission over this screen,
  // which never leaves the foreground — so without this the row would still read the answer
  // from before the prompt.
  useFocusEffect(
    useCallback(() => {
      void permissionGranted().then(setNotifGranted);
    }, []),
  );

  // The app is versioned by the moon: `expoConfig.version` is the Umm al-Qura date it shipped on
  // (`YYYY.MM.DD`, a Hijri date that also happens to be valid SemVer) — already a Hijri date, so
  // we show the triple as-is rather than humanising it twice.
  const version = Constants.expoConfig?.version ?? '—';
  const email = user?.email ?? '';
  const handle = email.split('@')[0] ?? '';
  const displayName = handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : 'Your account';
  const monogram = (handle || email || '?').charAt(0).toUpperCase();

  const runDelete = async () => {
    setBusy(true);
    try {
      await deleteAccount();
      // On success the auth gate navigates away, unmounting this screen.
    } catch {
      setBusy(false);
      Alert.alert('Could not delete account', 'Please check your connection and try again.');
    }
  };

  const confirmDelete = () =>
    confirmDestructive({
      title: 'Delete account',
      message: 'This permanently deletes your account and all your habits. This can’t be undone.',
      onConfirm: () => void runDelete(),
    });

  const runReset = async () => {
    if (!user) return;
    setClearing(true);
    try {
      await clearCompletionHistory(user.id);
      setClearing(false);
      // Habits and stacks are untouched; the Habits/Progress tabs refetch on focus,
      // so they show a clean slate on return. A quiet toast confirms — no blocking dialog needed.
      toast.show('Progress reset — your habits and stacks are untouched.', 'success');
    } catch {
      setClearing(false);
      toast.show('Could not reset progress. Check your connection.', 'danger');
    }
  };

  const confirmReset = () =>
    confirmDestructive({
      title: 'Reset progress',
      message:
        'This permanently deletes all your completion history — every check-off — for a fresh start. Your habits and stacks stay. This can’t be undone.',
      confirmLabel: 'Reset',
      onConfirm: () => void runReset(),
    });

  // In-flight latch: with permission already denied the checks resolve instantly, and two quick
  // taps would otherwise queue two identical "Notifications are off" alerts back to back.
  const notifBusy = useRef(false);
  const enableNotifications = async () => {
    if (notifBusy.current) return;
    notifBusy.current = true;
    try {
      // Already on: there's no permission to request, so the only useful action is to
      // hand off to the OS settings — otherwise the tap is a silent no-op on a row that
      // looks tappable. iOS can't re-prompt once decided, so this is also the way back.
      if (await permissionGranted()) {
        await Linking.openSettings();
        return;
      }
      const granted = await ensurePermission();
      setNotifGranted(granted);
      if (!granted) {
        Alert.alert(
          'Notifications are off',
          'Turn on notifications in system settings to get your lunar updates.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open settings', onPress: () => void Linking.openSettings() },
          ],
        );
      }
    } finally {
      notifBusy.current = false;
    }
  };

  // State only — the chevron already says it's tappable; a denied tap surfaces the
  // "open settings" path in an alert. `undefined` while the mount check resolves.
  const notifSublabel = notifGranted === true ? 'Allowed' : notifGranted === false ? 'Blocked in system settings' : undefined;

  // Turning the feature on is where the OS prompt is earned, so the first time it goes through
  // the sheet that explains what the four nights are; that sheet flips the preference itself,
  // whatever the OS answers (the System notifications row then says if it is blocked). Once
  // permission exists the switch is just a switch.
  const onToggleLunarUpdates = (value: boolean) => {
    if (!value || notifGranted === true) {
      setPreference('lunarUpdates', value);
      return;
    }
    router.push('/settings/lunar-updates');
  };

  // Sign-out asks first: the row sits directly under "Change password", so one mis-tap would
  // otherwise dump the user straight to the sign-in screen. Not destructive — plain buttons.
  // A failed sign-out (offline: Supabase's /logout throws) must say so, not vanish into an
  // unhandled rejection leaving the user parked on Settings with no feedback.
  const confirmSignOut = () =>
    Alert.alert('Sign out', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        onPress: () =>
          void signOut().catch(() => toast.show('Could not sign out. Check your connection.', 'danger')),
      },
    ]);

  return (
    <AppScreen transparent contentStyle={styles.content}>
      {/* Identity. The mark is the one thing on this screen the user owns rather than configures,
          so it is the thing that opens the photo sheet — not a row further down naming it. The
          text beside it stays inert: a whole-block target would put "sign in as someone else" and
          "change your picture" on the same tap. */}
      <View style={styles.identity}>
        <Pressable
          onPress={() => router.push({ pathname: '/settings/photo', params: { path: avatar.path ?? '' } })}
          accessibilityRole="button"
          accessibilityLabel={avatar.path ? 'Change your photo' : 'Add a photo'}
          style={({ pressed }) => pressed && styles.pressed}>
          <Avatar url={avatar.url} cacheKey={avatar.path} monogram={monogram} />
        </Pressable>
        <View style={styles.identityText}>
          <ThemedText type="defaultSemiBold" numberOfLines={1}>
            {displayName}
          </ThemedText>
          {email ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {email}
            </ThemedText>
          ) : null}
        </View>
      </View>

      {/* Appearance */}
      <View style={styles.controlGroup}>
        <SectionLabel>APPEARANCE</SectionLabel>
        <ThemeSegmented />
      </View>

      {/* The calendar — the settings that change what a date or a chapter *means*. Each defaults
          to the app's own reckoning, and each says plainly what else it moves. */}
      <SettingsSection title="The day" footer="The Hijri date also moves habits scheduled on Hijri days.">
        <SettingsRow
          icon="calendar"
          label="Hijri date"
          value={describeHijriOffset(hijriOffset)}
          onPress={() => router.push('/settings/hijri-adjust')}
          showChevron
        />
        <SettingsRow
          icon="sunrise"
          label="Times of day"
          value={dayBands ? 'My times' : 'The sun'}
          onPress={() => router.push('/settings/day-times')}
          showChevron
        />
      </SettingsSection>

      {/* Week start — the same bare-segmented shape as Appearance: three mutually-exclusive
          options read better as one control than as a row that opens a list of three. */}
      <View style={styles.controlGroup}>
        <SectionLabel>WEEK STARTS ON</SectionLabel>
        <Segmented
          options={WEEK_STARTS}
          value={String(weekStart)}
          onChange={(value) => setPreference('weekStart', Number(value) as WeekStart)}
        />
      </View>

      {/* Lunar updates — the app's only notifications. Four a month, at the quarters of the
          moon; the permission row appears only once they're wanted, since that's the only
          state in which the OS answer matters. */}
      <SettingsSection
        title="Lunar updates"
        footer={
          notificationsAvailable
            ? nextUpdate
              ? `Next · ${nextUpdate}`
              : 'New moon, first quarter, full moon, last quarter.'
            : undefined
        }>
        {notificationsAvailable ? (
          <SettingsRow
            icon="moon"
            label="Lunar updates"
            // The same rule `nextUpdate` already keeps — don't promise what the OS won't deliver —
            // applied to the row that looks most satisfied. A switch reading ON directly above
            // "Allow notifications · Off" is two adjacent rows saying opposite things, and leaves
            // the reader to work out which one wins. The switch keeps the user's preference (it is
            // still what they want); the sublabel just stops describing a schedule that cannot run.
            sublabel={
              lunarUpdatesOn && notifGranted === false
                ? 'Enable system notifications to receive these'
                : 'Four nights a lunar month'
            }
            switchValue={lunarUpdatesOn}
            onSwitchChange={onToggleLunarUpdates}
          />
        ) : (
          <SettingsRow icon="notificationsOff" label="Lunar updates" value="Unavailable" />
        )}
        {notificationsAvailable && lunarUpdatesOn ? (
          <SettingsRow
            icon={notifGranted === false ? 'notificationsOff' : 'notifications'}
            label="System notifications"
            sublabel={notifSublabel}
            onPress={() => void enableNotifications()}
            showChevron
          />
        ) : null}
      </SettingsSection>

      {/* Feel — the app's own texture. Every one defaults on; turning one off is a preference
          for quiet, never a loss of function. */}
      <SettingsSection title="Feel" footer="Sky motion also follows your system’s Reduce Motion setting.">
        <SettingsRow
          icon="vibration"
          label="Haptics"
          switchValue={hapticsOn}
          onSwitchChange={(value) => setPreference('haptics', value)}
        />
        <SettingsRow
          icon="moon"
          label="Celebrate finishing the day"
          switchValue={celebrateDay}
          onSwitchChange={(value) => setPreference('celebrateDay', value)}
        />
        <SettingsRow
          icon="sparkle"
          label="Sky motion"
          switchValue={skyMotion}
          onSwitchChange={(value) => setPreference('skyMotion', value)}
        />
      </SettingsSection>

      {/* Account */}
      <SettingsSection title="Account">
        <SettingsRow
          icon="lock"
          label="Change password"
          onPress={() => router.push('/settings/change-password')}
          showChevron
        />
        <SettingsRow icon="signOut" label="Sign out" onPress={confirmSignOut} />
      </SettingsSection>

      {/* Guide — the in-app how-to for the app's two methods, split out from the external
          legal/support links in "About" so a "learn how it works" row doesn't read as fine print.
          Both guides also open from the library each one explains; this is where you find them
          when you are not in the middle of adding anything. */}
      <SettingsSection title="Guide">
        <SettingsRow
          icon="stack"
          label="Habit stacking"
          onPress={() => router.push('/settings/stacking-info')}
          showChevron
        />
        <SettingsRow
          icon="exchange"
          label="Exchanges"
          onPress={() => router.push('/settings/exchange-info')}
          showChevron
        />
      </SettingsSection>

      {/* About */}
      <SettingsSection title="About">
        <SettingsRow icon="privacy" label="Privacy Policy" onPress={() => openBrowser(Links.privacy)} showChevron />
        <SettingsRow icon="document" label="Terms of Service" onPress={() => openBrowser(Links.terms)} showChevron />
        <SettingsRow icon="help" label="Support" onPress={() => openBrowser(Links.support)} showChevron />
      </SettingsSection>

      {/* Destructive actions — an unlabeled card at the foot of the list. No "Danger zone"
          heading: the red rows carry the warning themselves. */}
      <SettingsSection>
        <SettingsRow
          icon="reset"
          label="Reset progress"
          destructive
          busy={clearing}
          onPress={confirmReset}
        />
        <SettingsRow
          icon="deleteOutline"
          label="Delete account"
          destructive
          busy={busy}
          onPress={confirmDelete}
        />
      </SettingsSection>

      {/* Footer — a quiet sign-off. The app's website + socials sit here as a compact icon row
          (the conventional home for them); the version follows (not a tappable-looking row), and
          the maker credit is a single whisper-quiet link to the projects page, not a section. */}
      <View style={styles.footer}>
        <SocialLinks style={styles.footerSocial} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.footerText}>
          {APP_NAME} · {version}
        </ThemedText>
        <Pressable
          onPress={() => openBrowser(Links.maker)}
          accessibilityRole="link"
          accessibilityLabel="Made by Edenmind, opens andreassonphoto.com"
          style={({ pressed }) => [styles.makerLink, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.footerText}>
            Made by Edenmind
          </ThemedText>
          <AppIcon name="openInNew" size={13} color={theme.textSecondary} />
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.four,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  identityText: { flex: 1, gap: Spacing.half },
  controlGroup: { gap: Spacing.two },
  footer: { alignItems: 'center', gap: Spacing.half, paddingTop: Spacing.two },
  // A little air below the social row so it doesn't crowd the version line beneath it.
  footerSocial: { marginBottom: Spacing.two },
  footerText: { textAlign: 'center' },
  // The screen's one press feedback, shared by the two things here that are neither a row nor a
  // button: the avatar and the maker credit.
  pressed: { opacity: Pressed.dim },
  makerLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
