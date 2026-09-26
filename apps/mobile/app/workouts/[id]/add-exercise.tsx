import { router, useLocalSearchParams } from 'expo-router';
import { addExerciseFromHistory } from '../../../src/data/sessionRepo';
import { db } from '../../../src/db/client';
import { ExerciseList } from '../../../src/features/library/ExerciseList';

export default function AddExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ExerciseList
      onAdd={(exerciseIds) => {
        // Planned as last done, or one set of 8 for something new.
        for (const exerciseId of exerciseIds) addExerciseFromHistory(db, id, exerciseId);
        router.back();
      }}
    />
  );
}
