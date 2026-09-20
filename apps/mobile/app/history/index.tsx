import { Stack } from 'expo-router';
import { HistoryList } from '../../src/features/history/HistoryList';

export default function HistoryScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'History' }} />
      <HistoryList />
    </>
  );
}
