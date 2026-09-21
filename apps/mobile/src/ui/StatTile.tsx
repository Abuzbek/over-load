import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

export function StatTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <View style={styles.tile}>
      <Text variant="label" color="textMuted">{label}</Text>
      <Text variant="numeric" style={styles.value}>{value}</Text>
      {caption ? <Text variant="caption" color="textMuted">{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  value: { fontSize: 22, lineHeight: 28 },
});
