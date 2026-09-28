import { useLocalSearchParams } from 'expo-router';
import { WorkoutComplete } from '../../../src/features/session/WorkoutComplete';

export default function WorkoutCompleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WorkoutComplete sessionId={id} />;
}
