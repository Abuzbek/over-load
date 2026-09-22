import { Lucide } from '@react-native-vector-icons/lucide';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../ui/Button';
import { ListRow } from '../../ui/ListRow';
import { Sheet } from '../../ui/Sheet';
import { theme } from '../../ui/theme';

type IconName = 'route' | 'dumbbell';

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
 * The tab bar's centre button. Creation lives here and nowhere else.
 *
 * Both rows route to the screen that already owns naming (?new=1 opens its
 * existing create sheet) rather than growing a third copy of the create flow.
 * There is no "start an empty workout" any more: a workout comes from the
 * library or a program day, so nothing here can strand an in-progress session
 * and no active-workout guard is needed.
 */
export function ShortcutsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  function go(pathname: string) {
    onClose();
    router.push(pathname);
  }

  return (
    <Sheet visible={visible} onRequestClose={onClose} anchor="bottom" title="Shortcuts">
      <View style={styles.rows}>
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
