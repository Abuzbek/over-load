import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { theme } from './theme';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  body?: string;
  /** 'bottom' slides the card to the bottom edge, for a shortcuts-style menu. */
  anchor?: 'center' | 'bottom';
  /**
   * Fired once the modal has finished animating in. autoFocus on a TextInput
   * inside a Modal is unreliable on Android, so a sheet with an input focuses
   * it explicitly from here.
   */
  onShow?: () => void;
  children: ReactNode; // the action buttons
};

// A Modal, never Alert: Alert.prompt is iOS-only and Alert's button semantics
// are iOS-shaped. This app ships Android too (R19).
export function Sheet({ visible, onRequestClose, title, body, anchor = 'center', onShow, children }: Props) {
  const insets = useSafeAreaInsets();
  // The tap that opens a sheet ends on the backdrop that has just mounted
  // underneath the finger, which dismissed the sheet in the same gesture that
  // asked for it. The backdrop only listens once the modal has finished
  // presenting; no real tap can arrive before that.
  const [presented, setPresented] = useState(false);

  useEffect(() => {
    if (!visible) setPresented(false);
  }, [visible]);

  // A bottom-anchored card sits on the screen edge, so it owns the home
  // indicator gap — nothing else reserves it. Added to the card's own padding,
  // never in place of it, or the last button hugs the edge on a device with no
  // indicator at all.
  const bottomInset =
    anchor === 'bottom' ? { paddingBottom: insets.bottom + theme.spacing.lg } : undefined;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      onShow={() => {
        setPresented(true);
        onShow?.();
      }}
    >
      {/* Tapping outside dismisses, the way every other sheet on both
          platforms does. The card claims the touch itself (it is not a
          Pressable — a nested one would swallow its children's presses), so a
          tap on a button inside never reaches the backdrop. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => presented && onRequestClose()}
        style={[styles.backdrop, anchor === 'bottom' && styles.backdropBottom]}
      >
        <View
          onStartShouldSetResponder={() => true}
          style={[styles.card, anchor === 'bottom' && styles.cardBottom, bottomInset]}
        >
          <Text variant="title">{title}</Text>
          {body ? <Text color="textMuted">{body}</Text> : null}
          {children}
        </View>
      </Pressable>
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
