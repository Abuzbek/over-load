import { formatDuration, restRemainingSeconds } from '@overload/domain';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

type Props = {
  startedAt: number;
  restSeconds: number;
  onDismiss: () => void;
};

export function RestTimer({ startedAt, restSeconds, onDismiss }: Props) {
  // The interval only triggers a re-render; the value itself comes from the clock,
  // so a missed tick during suspension corrects itself on the next render.
  const [, setTick] = useState(0);

  useEffect(() => {
    const handle = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(handle);
  }, []);

  const remaining = restRemainingSeconds(startedAt, restSeconds, Date.now());
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        remaining === 0 && styles.barDone,
        { paddingBottom: theme.spacing.md + insets.bottom },
      ]}
    >
      <Text>{remaining === 0 ? 'Rest complete' : 'Rest'}</Text>
      <Text variant="numeric" style={styles.time}>
        {formatDuration(remaining)}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onDismiss}
        accessibilityLabel="Skip rest"
        // Literal, NOT theme.spacing: this is a touch target, not decoration.
        // "Skip" is ~20pt tall, so 14 either side clears the 48pt floor — and
        // shrinking the spacing scale must never quietly shrink a tap target.
        hitSlop={14}
      >
        <Text variant="heading" color="accent">Skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  barDone: { backgroundColor: theme.colors.success },
  // Countdown is the one glanceable element on this bar — read at arm's length,
  // mid-set. `numeric` is deliberately body-sized (15/20) for set-input boxes,
  // so bump it back up here locally rather than resizing the shared variant,
  // which would also enlarge every set-row input on the session screen.
  time: { fontSize: 20, lineHeight: 26 },
});
