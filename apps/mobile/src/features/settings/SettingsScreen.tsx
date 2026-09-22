import { Lucide } from '@react-native-vector-icons/lucide';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

const GENERAL = [
  { title: 'Account', icon: 'user', href: '/settings/account' },
  { title: 'Gym', icon: 'dumbbell', href: '/settings/gym' },
  { title: 'Units', icon: 'ruler', href: '/settings/units' },
  { title: 'Language', icon: 'languages', href: '/settings/language' },
] as const;

export function SettingsScreen() {
  return (
    <Screen scroll safeTop>
      <Text variant="display">More</Text>

      <View style={styles.section}>
        <SectionLabel>General</SectionLabel>
        <Card style={styles.rows}>
          {GENERAL.map((item) => (
            <ListRow
              key={item.title}
              title={item.title}
              leading={<Lucide name={item.icon} size={18} color={theme.colors.textMuted} />}
              right={<Lucide name="chevron-right" size={18} color={theme.colors.textMuted} />}
              onPress={() => router.push(item.href)}
            />
          ))}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm },
  rows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
});
