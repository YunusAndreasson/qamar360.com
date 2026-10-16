import { useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';

import { FormSheet, SheetActions } from '@/components/form-sheet';
import { SectionLabel } from '@/components/section-label';
import { Spacing } from '@/constants/theme';

/**
 * The day's one fork: six things you can start, under the question their captions answer — does it
 * come back tomorrow?
 *
 * **Goal sits in REPEATING**, and that is not a fudge. A goal is a horizon, which is neither; but
 * setting one now sets its check-in too, and the check-in is what comes back. The row it replaced
 * said "Check-in", which asked the user to know that a goal existed somewhere else first — and a
 * goal set from the other tab appeared precisely nowhere until they found this row. One door now,
 * and what comes out of it lands on the day.
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
          { icon: 'goal', label: 'Goal', sublabel: 'A horizon over the acts you keep', onPress: () => router.replace('/habits/goal-new') },
        ]} />
      </View>
      <View style={styles.group}>
        <SectionLabel>One-off</SectionLabel>
        <SheetActions actions={[
          { icon: 'task', label: 'To-do', sublabel: 'Something to do today', onPress: () => router.dismissTo({ pathname: '/habits', params: { compose: 'task' } }) },
          { icon: 'plan', label: 'Plan', sublabel: 'Save something for later', onPress: () => router.replace('/habits/plans') },
        ]} />
      </View>
    </FormSheet>
  );
}

const styles = StyleSheet.create({ group: { gap: Spacing.two } });
