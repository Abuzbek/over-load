import { useLocalSearchParams } from 'expo-router';
import { ProgramEditor } from '../../src/features/programs/ProgramEditor';

export default function ProgramRoute() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return <ProgramEditor programId={id} programName={name ?? 'Program'} />;
}
