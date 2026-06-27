import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { SectionLabel } from '@/components/section-label';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { ThemeSegmented } from '@/components/theme-segmented';
import { ThemedText } from '@/components/themed-text';
import { Links } from '@/constants/links';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { clearCompletionHistory } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { ensurePermission, permissionGranted, remindersAvailable } from '@/lib/notifications';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signOut, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);

  // Reflect the real OS permission on mount (without prompting), so the row shows
  // accurate state rather than a "tap to…" guess.
  useEffect(() => {
    void permissionGranted().then(setNotifGranted);
  }, []);

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
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all your habits. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void runDelete() },
      ],
    );

  const runReset = async () => {
    if (!user) return;
    setClearing(true);
    try {
      await clearCompletionHistory(user.id);
      setClearing(false);
      // Habits, stacks, and reminders are untouched; the Habits/Progress tabs refetch on focus,
      // so they show a clean slate on return.
      Alert.alert('Progress reset', 'Your completion history was cleared. Your habits and stacks are untouched.');
    } catch {
      setClearing(false);
      Alert.alert('Could not reset progress', 'Please check your connection and try again.');
    }
  };

  const confirmReset = () =>
    Alert.alert(
      'Reset progress',
      'This permanently deletes all your completion history — every check-off — for a fresh start. Your habits and stacks stay. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => void runReset() },
      ],
    );

  const enableNotifications = async () => {
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

  return (
    <AppScreen contentStyle={styles.content}>
      {/* Identity */}
      <View style={styles.identity}>
        <View style={[styles.monogram, { backgroundColor: theme.accentSubtle }]}>
          <ThemedText type="subtitle" themeColor="accent">
            {monogram}
          </ThemedText>
        </View>
        <View style={styles.identityText}>
          <ThemedText type="default" numberOfLines={1}>
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
      <SettingsSection
        title="Notifications"
        footer={
          remindersAvailable ? 'Reminders are set per habit when you create or edit one.' : undefined
        }>
        {remindersAvailable ? (
          <SettingsRow
            icon={notifGranted === false ? 'notifications-off' : 'notifications'}
            label="Allow notifications"
            sublabel={notifSublabel}
            onPress={() => void enableNotifications()}
            showChevron
          />
        ) : (
          <SettingsRow
            icon="notifications-off"
            label="Reminders"
            sublabel="Need a development build (not available in Expo Go)."
          />
        )}
      </SettingsSection>

      {/* Account */}
      <SettingsSection title="Account">
        <SettingsRow
          icon="lock-outline"
          label="Change Password"
          onPress={() => router.push('/settings/change-password')}
          showChevron
        />
        <SettingsRow icon="logout" label="Sign out" onPress={() => void signOut()} />
      </SettingsSection>

      {/* About */}
      <SettingsSection title="About">
        <SettingsRow icon="info-outline" label="Version" value={version} />
        <SettingsRow
          icon="privacy-tip"
          label="Privacy Policy"
          onPress={() => void WebBrowser.openBrowserAsync(Links.privacy)}
          showChevron
        />
        <SettingsRow
          icon="description"
          label="Terms of Service"
          onPress={() => void WebBrowser.openBrowserAsync(Links.terms)}
          showChevron
        />
        <SettingsRow
          icon="help-outline"
          label="Support"
          onPress={() => void WebBrowser.openBrowserAsync(Links.support)}
          showChevron
        />
      </SettingsSection>

      {/* Danger zone */}
      <SettingsSection title="Danger zone">
        <SettingsRow
          icon="restart-alt"
          label="Reset progress"
          sublabel="Clear all completion history for a fresh start — keeps your habits & stacks"
          destructive
          busy={clearing}
          onPress={confirmReset}
        />
        <SettingsRow
          icon="delete-outline"
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
  monogram: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1, gap: Spacing.half },
  appearance: { gap: Spacing.two },
});
