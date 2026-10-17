import { useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';

import { FormSheet, SheetActions } from '@/components/form-sheet';
import { SectionLabel } from '@/components/section-label';
import { Spacing } from '@/constants/theme';

/**
 * The day's one fork: the things you can start, under the question their captions answer — does it
 * come back tomorrow?
 */
export default function AddMenuScreen() {
  const router = useRouter();
  return (
    <FormSheet title="Add">
      <View style={styles.group}>
        <SectionLabel>Repeating</SectionLabel>
        <SheetActions actions={[
          { icon: 'stack', label: 'Stack', sublabel: 'A routine with several habits', onPress: () => router.replace('/habits/stack-library') },
          { icon: 'repeat', label: 'Habit', sublabel: 'One activity to repeat', onPress: () => router.replace('/habits/discover') },
          { icon: 'exchange', label: 'Exchange', sublabel: 'Replace an unwanted habit', onPress: () => router.replace('/habits/exchange-library') },
        ]} />
      </View>
      <View style={styles.group}>
        <SectionLabel>One-off</SectionLabel>
        <SheetActions actions={[
          { icon: 'task', label: 'To-do', sublabel: 'Something to do today', onPress: () => router.dismissTo({ pathname: '/habits', params: { compose: 'task' } }) },
        ]} />
      </View>
    </FormSheet>
  );
}

const styles = StyleSheet.create({ group: { gap: Spacing.two } });
