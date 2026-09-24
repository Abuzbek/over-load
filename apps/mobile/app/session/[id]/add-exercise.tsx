import { router, useLocalSearchParams } from 'expo-router';
import { addExerciseToSession } from '../../../src/data/sessionRepo';
import { db } from '../../../src/db/client';
import { ExerciseList } from '../../../src/features/library/ExerciseList';

export default function AddExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ExerciseList
      onAdd={(exerciseIds) => {
        for (const exerciseId of exerciseIds) addExerciseToSession(db, id, exerciseId, Date.now());
        router.back();
      }}
    />
  );
}
