import { Lucide } from '@react-native-vector-icons/lucide';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { discardWorkout, getActiveWorkoutId, startEmptyWorkout } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { ListRow } from '../../ui/ListRow';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

type IconName = 'arrow-right-from-line' | 'route' | 'dumbbell';

function Shortcut({ icon, title, onPress }: { icon: IconName; title: string; onPress: () => void }) {
  return (
    <ListRow
      title={title}
      leading={<Lucide name={icon} size={20} color={theme.colors.text} />}
      right={<Lucide name="chevron-right" size={18} color={theme.colors.textMuted} />}
      onPress={onPress}
    />
  );
}

/**
 * The tab bar's centre button. Creation lives here and nowhere else on the
 * Workout tab, which is now purely a place to read what you have.
 */
export function ShortcutsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  // The same guard the routine builder carries: getActiveWorkoutId only ever
  // returns the newest unfinished workout, so silently starting a second one
  // strands the first — no endedAt keeps it out of history, and a newer
  // sibling keeps it out of resume.
  const activeWorkoutId = visible ? getActiveWorkoutId(db) : null;

  function startEmpty() {
    onClose();
    const workoutId = startEmptyWorkout(db, 'Empty workout', Date.now());
    router.push(`/session/${workoutId}`);
  }

  function go(pathname: string) {
    onClose();
    router.push(pathname);
  }

  if (activeWorkoutId) {
    return (
      <Sheet
        visible={visible}
        onRequestClose={onClose}
        anchor="bottom"
        title="A workout is already in progress"
        body="Resume it, or discard it and start an empty one. Discarding keeps nothing from the unfinished workout."
      >
        <Button
          title="Resume it"
          onPress={() => {
            onClose();
            router.push(`/session/${activeWorkoutId}`);
          }}
        />
        <Button
          title="Discard it and start"
          variant="destructive"
          onPress={() => {
            discardWorkout(db, activeWorkoutId, Date.now());
            startEmpty();
          }}
        />
        <Button title="Cancel" variant="secondary" onPress={onClose} />
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onRequestClose={onClose} anchor="bottom" title="Shortcuts">
      <View style={styles.rows}>
        <Shortcut icon="arrow-right-from-line" title="Empty Workout" onPress={startEmpty} />
        <Shortcut icon="route" title="New Program" onPress={() => go('/programs?new=1')} />
        <Shortcut icon="dumbbell" title="New Workout" onPress={() => go('/routines?new=1')} />
      </View>
      <Button title="Close" variant="secondary" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Cancel the Sheet card's horizontal padding so the rows and their dividers
  // run the full width, as list rows do everywhere else.
  rows: { marginHorizontal: -theme.spacing.lg },
});
