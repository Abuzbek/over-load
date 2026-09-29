import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { HabitsCalendar } from '../src/features/dashboard/DashboardWidgets';
import { theme } from '../src/ui/theme';
import { useSyncedData } from '../src/sync/syncService';

export default function HabitsRoute() {
  const [, setVersion] = useState(0);
  useSyncedData();
  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));
  return (
    <>
      <Stack.Screen options={{ title: 'Habits' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <HabitsCalendar onChanged={() => setVersion((v) => v + 1)} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({ content: { padding: theme.spacing.lg } });
