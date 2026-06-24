import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const { user, signOut, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);

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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Settings</ThemedText>
        {user?.email ? (
          <ThemedText type="small" themeColor="textSecondary">
            {user.email}
          </ThemedText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Sign out</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={confirmDelete}
          style={[styles.button, { backgroundColor: theme.dangerSubtle, opacity: busy ? 0.6 : 1 }]}>
          {busy ? (
            <ActivityIndicator color={theme.danger} />
          ) : (
            <ThemedText type="smallBold" style={{ color: theme.danger }}>
              Delete account
            </ThemedText>
          )}
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  button: {
    marginTop: Spacing.three,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    minWidth: 160,
    alignItems: 'center',
  },
});
