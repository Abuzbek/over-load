import { StyleSheet, View } from 'react-native';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

/**
 * A field with nothing stored behind it yet. Deliberately has no `onPress`:
 * ListRow then omits the button role, so it is neither announced as
 * activatable nor styled as tappable. A row that looks live and does nothing
 * is worse than one that plainly does not.
 */
function PlaceholderRow({ title, value }: { title: string; value: string }) {
  return (
    <ListRow
      title={title}
      right={
        <Text variant="body" color="textMuted">
          {value}
        </Text>
      }
    />
  );
}

const PROFILE = ['Name', 'Birthday', 'Gender', 'Weight', 'Height', 'Cardio experience', 'Lifting experience'];

export function AccountScreen() {
  return (
    <Screen scroll>
      <Text variant="caption" color="textMuted">
        Laid out, not wired up. Every field here needs accounts and a user
        table, neither of which exists yet.
      </Text>

      <View style={styles.section}>
        <SectionLabel>Profile</SectionLabel>
        <Card style={styles.rows}>
          {PROFILE.map((field) => (
            <PlaceholderRow key={field} title={field} value="—" />
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Security</SectionLabel>
        <Card style={styles.rows}>
          <PlaceholderRow title="Email" value="—" />
          <PlaceholderRow title="Password" value="••••••••" />
        </Card>
        {/* Disabled, not silently inert: a Log out that looks live and does
            nothing is the worst version of this row. */}
        <Button title="Log out" variant="destructive" disabled onPress={() => {}} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm },
  rows: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
});
