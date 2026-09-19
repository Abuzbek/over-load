import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '../src/ui/Button';
import { theme } from '../src/ui/theme';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Workouts' }} />
      <Link href="/routines" asChild>
        <Button title="Routines" onPress={() => {}} />
      </Link>
      <Link href="/exercises" asChild>
        <Button title="Browse exercises" onPress={() => {}} />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
});
