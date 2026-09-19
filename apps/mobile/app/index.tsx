import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { exercises } from '@workouts/schema';
import { db } from '../src/db/client';

export default function HomeScreen() {
  const { data } = useLiveQuery(db.select().from(exercises));

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Workouts' }} />
      <Text style={styles.text}>Exercise library: {data?.length ?? 0} exercises</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16 },
});
