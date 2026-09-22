import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';
import { theme } from './theme';

type Props = { title: string; body?: string; action?: { title: string; onPress: () => void } };

export function EmptyState({ title, body, action }: Props) {
  return (
    <View style={styles.wrap}>
      <Text variant="title">{title}</Text>
      {body ? <Text color="textMuted" style={styles.centered}>{body}</Text> : null}
      {action ? <Button title={action.title} onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  centered: { textAlign: 'center' },
});
