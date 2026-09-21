import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { InProgressBar } from '../../src/features/session/InProgressBar';
import { Text } from '../../src/ui/Text';
import { theme } from '../../src/ui/theme';

function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
          tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
          tabBarActiveTintColor: theme.colors.accent,
          tabBarInactiveTintColor: theme.colors.textMuted,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Train', tabBarIcon: ({ color }) => <TabIcon glyph="◈" color={color} /> }}
        />
        <Tabs.Screen
          name="history"
          options={{ title: 'History', tabBarIcon: ({ color }) => <TabIcon glyph="◷" color={color} /> }}
        />
        <Tabs.Screen
          name="progress"
          options={{ title: 'Progress', tabBarIcon: ({ color }) => <TabIcon glyph="◭" color={color} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} /> }}
        />
      </Tabs>
      <InProgressBar />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: theme.colors.background } });
