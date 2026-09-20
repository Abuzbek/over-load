import { Stack } from 'expo-router';
import { RecordsList } from '../src/features/records/RecordsList';

export default function RecordsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Records' }} />
      <RecordsList />
    </>
  );
}
