import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createRoutine, listRoutines } from '../../data/routineRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { ListRow } from '../../ui/ListRow';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { textStyle } from '../../ui/typography';

export function RoutineList() {
  // This screen is pushed on the stack, so there is no tab bar under the
  // footer to reserve the home indicator gap.
  const insets = useSafeAreaInsets();
  // A local counter is the refresh signal: every mutation bumps it and
  // re-reads listRoutines below. It is not used as a `key` on the container —
  // that would remount the FlatList and reset scroll position.
  const [, setVersion] = useState(0);
  const routines = listRoutines(db);

  // The tab bar's + sheet routes here with ?new=1 rather than duplicating the
  // create flow: this screen already owns naming and creation.
  const { new: newParam } = useLocalSearchParams<{ new?: string }>();
  const [isModalVisible, setModalVisible] = useState(newParam === '1');
  const [name, setName] = useState('');
  const inputRef = useRef<TextInput>(null);

  const onCreate = useCallback(() => {
    setName('');
    setModalVisible(true);
  }, []);

  const onCancel = useCallback(() => {
    setModalVisible(false);
    setName('');
  }, []);

  const onConfirm = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const routine = createRoutine(db, trimmed);
    setVersion((v) => v + 1);
    setModalVisible(false);
    setName('');
    router.push(`/routines/${routine.id}`);
  }, [name]);

  return (
    <View style={styles.container}>
      <FlatList
        data={routines}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.emptyContent}
        ListEmptyComponent={
          <EmptyState title="No workouts yet" body="Create one and it will show up here." />
        }
        renderItem={({ item }) => (
          <ListRow title={item.name} onPress={() => router.push(`/routines/${item.id}`)} />
        )}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <Button title="New workout" onPress={onCreate} />
      </View>

      <Modal
        visible={isModalVisible}
        transparent
        animationType="fade"
        onRequestClose={onCancel}
        // autoFocus on the TextInput is unreliable inside a Modal on Android,
        // so focus it explicitly once the modal has finished animating in.
        onShow={() => inputRef.current?.focus()}
      >
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text variant="title">New workout</Text>
            <TextInput
              ref={inputRef}
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              onSubmitEditing={onConfirm}
            />
            <View style={styles.modalActions}>
              <View style={styles.modalActionButton}>
                <Button title="Cancel" variant="secondary" onPress={onCancel} />
              </View>
              <View style={styles.modalActionButton}>
                <Button title="Create" onPress={onConfirm} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  // Matches HistoryList/Screen: without flexGrow the EmptyState (itself
  // flex: 1) top-aligns instead of centering, since a FlatList's content
  // container only grows to fill the list when told to.
  emptyContent: { flexGrow: 1 },
  footer: { padding: theme.spacing.lg },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  input: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    ...textStyle('body', true),
  },
  modalActions: { flexDirection: 'row', gap: theme.spacing.md },
  modalActionButton: { flex: 1 },
});
