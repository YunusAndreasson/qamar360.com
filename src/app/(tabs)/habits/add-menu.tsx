import { useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';

import { FormSheet, SheetActions } from '@/components/form-sheet';
import { SectionLabel } from '@/components/section-label';
import { Spacing } from '@/constants/theme';

export default function AddMenuScreen() {
  const router = useRouter();
  return (
    <FormSheet title="Add">
      <View style={styles.group}>
        <SectionLabel>REPEATING</SectionLabel>
        <SheetActions actions={[
          { icon: 'stack', label: 'Stack', sublabel: 'A routine with several habits', onPress: () => router.replace('/habits/stack-library') },
          { icon: 'repeat', label: 'Habit', sublabel: 'One activity to repeat', onPress: () => router.replace('/habits/discover') },
          { icon: 'exchange', label: 'Exchange', sublabel: 'Replace an unwanted habit', onPress: () => router.replace('/habits/exchange-library') },
          { icon: 'checkIn', label: 'Check-in', sublabel: 'Record a goal measurement', onPress: () => router.replace('/habits/check-in-new') },
        ]} />
      </View>
      <View style={styles.group}>
        <SectionLabel>ONE-OFF</SectionLabel>
        <SheetActions actions={[
          { icon: 'task', label: 'To-do', sublabel: 'A task for today', onPress: () => router.dismissTo({ pathname: '/habits', params: { compose: 'task' } }) },
          { icon: 'plan', label: 'Plan', sublabel: 'Save something for later', onPress: () => router.replace('/habits/plans') },
        ]} />
      </View>
    </FormSheet>
  );
}

const styles = StyleSheet.create({ group: { gap: Spacing.two } });
