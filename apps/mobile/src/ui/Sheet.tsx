import type { ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  body?: string;
  children: ReactNode; // the action buttons
};

// A Modal, never Alert: Alert.prompt is iOS-only and Alert's button semantics
// are iOS-shaped. This app ships Android too (R19).
export function Sheet({ visible, onRequestClose, title, body, children }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text variant="title">{title}</Text>
          {body ? <Text color="textMuted">{body}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
});
