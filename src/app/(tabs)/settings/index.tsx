import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { SectionLabel } from '@/components/section-label';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { ThemeSegmented } from '@/components/theme-segmented';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Links } from '@/constants/links';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { clearCompletionHistory } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/alerts';
import { ensurePermission, permissionGranted, remindersAvailable } from '@/lib/notifications';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { user, signOut, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);

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
      // Habits, stacks, and reminders are untouched; the Habits/Progress tabs refetch on focus,
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

  const enableNotifications = async () => {
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
        'Turn on notifications in system settings to get habit reminders.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => void Linking.openSettings() },
        ],
      );
    }
  };

  // State only — the chevron already says it's tappable; a denied tap surfaces the
  // "open settings" path in an alert. `undefined` while the mount check resolves.
  const notifSublabel = notifGranted === true ? 'On' : notifGranted === false ? 'Off' : undefined;

  // Sign-out asks first: the row sits directly under "Change password", so one mis-tap would
  // otherwise dump the user straight to the sign-in screen. Not destructive — plain buttons.
  const confirmSignOut = () =>
    Alert.alert('Sign out', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', onPress: () => void signOut() },
    ]);

  return (
    <AppScreen transparent contentStyle={styles.content}>
      {/* Identity */}
      <View style={styles.identity}>
        <View style={[styles.monogram, { backgroundColor: theme.accentSubtle }]}>
          <ThemedText type="subtitle" themeColor="accent">
            {monogram}
          </ThemedText>
        </View>
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
      <View style={styles.appearance}>
        <SectionLabel>APPEARANCE</SectionLabel>
        <ThemeSegmented />
      </View>

      {/* Notifications */}
      <SettingsSection title="Notifications">
        {remindersAvailable ? (
          <SettingsRow
            icon={notifGranted === false ? 'notificationsOff' : 'notifications'}
            label="Allow notifications"
            sublabel={notifSublabel}
            onPress={() => void enableNotifications()}
            showChevron
          />
        ) : (
          <SettingsRow icon="notificationsOff" label="Reminders" value="Unavailable" />
        )}
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

      {/* About */}
      <SettingsSection title="About">
        <SettingsRow icon="info" label="Version" value={version} />
        <SettingsRow
          icon="privacy"
          label="Privacy Policy"
          onPress={() => void WebBrowser.openBrowserAsync(Links.privacy)}
          showChevron
        />
        <SettingsRow
          icon="document"
          label="Terms of Service"
          onPress={() => void WebBrowser.openBrowserAsync(Links.terms)}
          showChevron
        />
        <SettingsRow
          icon="help"
          label="Support"
          onPress={() => void WebBrowser.openBrowserAsync(Links.support)}
          showChevron
        />
      </SettingsSection>

      {/* More from the maker — a quiet signature: byline → hub, socials, sibling apps. */}
      <SettingsSection title="More from the maker">
        <SettingsRow
          icon="person"
          label="Made by Yunus Andreasson"
          sublabel="andreassonphoto.com"
          onPress={() => void WebBrowser.openBrowserAsync(Links.maker)}
          showChevron
        />
        <SettingsRow
          icon="link"
          label="GitHub"
          onPress={() => void WebBrowser.openBrowserAsync(Links.github)}
          showChevron
        />
        <SettingsRow
          icon="link"
          label="X"
          onPress={() => void WebBrowser.openBrowserAsync(Links.x)}
          showChevron
        />
        <SettingsRow
          icon="link"
          label="Instagram"
          onPress={() => void WebBrowser.openBrowserAsync(Links.instagram)}
          showChevron
        />
        <SettingsRow
          icon="link"
          label="LinkedIn"
          onPress={() => void WebBrowser.openBrowserAsync(Links.linkedin)}
          showChevron
        />
        <SettingsRow
          icon="apps"
          label="islam.se"
          onPress={() => void WebBrowser.openBrowserAsync(Links.islamSe)}
          showChevron
        />
        <SettingsRow
          icon="apps"
          label="open-arabic"
          onPress={() => void WebBrowser.openBrowserAsync(Links.openArabic)}
          showChevron
        />
        <SettingsRow
          icon="apps"
          label="al-ibadah"
          onPress={() => void WebBrowser.openBrowserAsync(Links.alIbadah)}
          showChevron
        />
        <SettingsRow
          icon="apps"
          label="zuhd.news"
          onPress={() => void WebBrowser.openBrowserAsync(Links.zuhdNews)}
          showChevron
        />
      </SettingsSection>

      {/* Danger zone */}
      <SettingsSection title="Danger zone">
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
  monogram: { width: 56, height: 56, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1, gap: Spacing.half },
  appearance: { gap: Spacing.two },
});
