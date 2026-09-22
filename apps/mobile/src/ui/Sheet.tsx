import type { ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  body?: string;
  /** 'bottom' slides the card to the bottom edge, for a shortcuts-style menu. */
  anchor?: 'center' | 'bottom';
  children: ReactNode; // the action buttons
};

// A Modal, never Alert: Alert.prompt is iOS-only and Alert's button semantics
// are iOS-shaped. This app ships Android too (R19).
export function Sheet({ visible, onRequestClose, title, body, anchor = 'center', children }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={[styles.backdrop, anchor === 'bottom' && styles.backdropBottom]}>
        <View style={[styles.card, anchor === 'bottom' && styles.cardBottom]}>
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
  backdropBottom: { justifyContent: 'flex-end', padding: 0 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  // Square off the bottom corners: the card sits flush against the screen edge.
  cardBottom: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
});
