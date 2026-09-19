import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createRoutine, listRoutines } from '../../data/routineRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { ListRow } from '../../ui/ListRow';
import { theme } from '../../ui/theme';

export function RoutineList() {
  // A local counter is the refresh signal: every mutation bumps it and re-reads.
  const [version, setVersion] = useState(0);
  const routines = listRoutines(db);

  const [isModalVisible, setModalVisible] = useState(false);
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
    <View style={styles.container} key={version}>
      <FlatList
        data={routines}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No routines yet.</Text>}
        renderItem={({ item }) => (
          <ListRow title={item.name} onPress={() => router.push(`/routines/${item.id}`)} />
        )}
      />
      <View style={styles.footer}>
        <Button title="New routine" onPress={onCreate} />
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
            <Text style={styles.modalTitle}>New routine</Text>
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
  footer: { padding: theme.spacing.lg },
  empty: { ...theme.text.body, color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.xl },
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
  modalTitle: { ...theme.text.title, color: theme.colors.text },
  input: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    ...theme.text.body,
  },
  modalActions: { flexDirection: 'row', gap: theme.spacing.md },
  modalActionButton: { flex: 1 },
});
