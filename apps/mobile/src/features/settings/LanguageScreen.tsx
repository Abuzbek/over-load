import { Lucide } from '@react-native-vector-icons/lucide';
import { StyleSheet, View } from 'react-native';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

/**
 * One language, and it is already chosen. Shown as a list of one rather than an
 * empty state: the screen's job is to say what the app is running in, which is
 * a real answer today, and adding a second row is then the whole change.
 */
export function LanguageScreen() {
  return (
    <Screen>
      <View style={styles.section}>
        <Card style={styles.rows}>
          <ListRow
            title="English"
            right={<Lucide name="check" size={20} color={theme.colors.accent} />}
          />
        </Card>
        <Text variant="caption" color="textMuted">
          English only for now. Other languages will appear here.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm },
  rows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
});
