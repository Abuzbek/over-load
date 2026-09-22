import { Stack } from 'expo-router';
import { HistoryList } from '../../src/features/history/HistoryList';

// Pushed from the Dashboard rather than owning a tab. Dropping the tab must
// not drop the only route to past workouts.
export default function HistoryRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'History' }} />
      <HistoryList />
    </>
  );
}
