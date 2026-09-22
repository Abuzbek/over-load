import { formatElapsed } from '@overload/domain';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { useActiveWorkout } from './useActiveWorkout';

export function InProgressBar() {
  const { workout, elapsedMs } = useActiveWorkout();
  if (!workout) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Resume ${workout.name}, ${formatElapsed(elapsedMs)} elapsed`}
      onPress={() => router.push(`/session/${workout.id}`)}
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
    >
      <View style={styles.dot} />
      <Text variant="heading" style={styles.name} numberOfLines={1}>{workout.name}</Text>
      <Text variant="numeric" color="textMuted">{formatElapsed(elapsedMs)}</Text>
      <Text variant="heading" color="accent">Resume</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    minHeight: 48,
    backgroundColor: theme.colors.surfaceRaised,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  pressed: { opacity: 0.7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accent },
  name: { flex: 1 },
});
