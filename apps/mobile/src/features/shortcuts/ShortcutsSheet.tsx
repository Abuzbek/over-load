import { Lucide } from '@react-native-vector-icons/lucide';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { createRoutine } from '../../data/routineRepo';
import { db } from '../../db/client';
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
 * The tab bar's centre button, and the only place a program or workout is
 * created.
 *
 * New Program routes to the programs screen, which already owns naming
 * (?new=1 opens its create sheet). New Workout names the workout here instead:
 * the workout library is the Workout tab's own section, not a page to route
 * to, so there is nowhere else for the naming to live.
 */
export function ShortcutsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Not Sheet's onShow: the naming step swaps the contents of a Modal that is
  // already on screen, so the Modal never "shows" again and onShow never fires.
  // The input carries autoFocus for iOS, where it mounts fresh and that is
  // enough; this deferred focus is the Android fallback, where autoFocus inside
  // a Modal is unreliable. Focusing in the same tick as the state change does
  // not take — the input is not attached yet.
  useEffect(() => {
    if (!naming) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [naming]);

  // Whatever dismissed the sheet, it must not reopen mid-flow: `visible` is
  // owned by the tab layout, so a close that skips close() would otherwise
  // leave `naming` true and the next + press would land on the name field.
  useEffect(() => {
    if (!visible) {
      setNaming(false);
      setName('');
    }
  }, [visible]);

  function close() {
    setNaming(false);
    setName('');
    onClose();
  }

  function createWorkout() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const workout = createRoutine(db, trimmed);
    close();
    // Straight into the builder: a workout with no exercises is not useful yet,
    // and it is already in the library for the Workout tab to list.
    router.push(`/routines/${workout.id}`);
  }

  // ONE Sheet, contents switched inside it. Returning a different <Sheet>
  // element for the naming step unmounts this Modal and mounts another in the
  // same frame, and the sheet simply disappears.
  return (
    <Sheet
      visible={visible}
      onRequestClose={close}
      anchor="bottom"
      title={naming ? 'New workout' : 'Shortcuts'}
    >
      {naming ? (
        <>
          <TextInput
            ref={inputRef}
            value={name}
            onChangeText={setName}
            placeholder="Workout name"
            placeholderTextColor={theme.colors.textMuted}
            autoFocus
            onSubmitEditing={createWorkout}
            style={styles.input}
          />
          <Button title="Create" onPress={createWorkout} />
          <Button title="Cancel" variant="secondary" onPress={close} />
        </>
      ) : (
        <>
          <View style={styles.rows}>
            <Shortcut
              icon="route"
              title="New Program"
              onPress={() => {
                onClose();
                router.push('/programs?new=1');
              }}
            />
            <Shortcut icon="dumbbell" title="New Workout" onPress={() => setNaming(true)} />
          </View>
          <Button title="Close" variant="secondary" onPress={close} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Cancel the Sheet card's horizontal padding so the rows and their dividers
  // run the full width, as list rows do everywhere else.
  rows: { marginHorizontal: -theme.spacing.lg },
  input: {
    minHeight: 44,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
  },
});
