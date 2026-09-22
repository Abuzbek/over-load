import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { InProgressBar } from '../../src/features/session/InProgressBar';
import { Text } from '../../src/ui/Text';
import { theme } from '../../src/ui/theme';
import {Lucide} from '@react-native-vector-icons/lucide'
function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      // Composed into the tab bar itself (rather than mounted as a sibling after
      // <Tabs>) so it sits between the screen content and the tab icons. A sibling
      // after <Tabs> renders below the whole navigator, tab bar included — wrong.
      tabBar={(props) => (
        <>
          <InProgressBar />
          <BottomTabBar {...props} />
        </>
      )}
      screenOptions={{
        // Every tab screen renders its own serif `display` title, so a native
        // header would draw the same word twice — "Train" in the header and
        // "Train" again below it. `title` stays because it also names the tab.
        headerShown: false,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Workout', tabBarIcon: ({ color }) => <Lucide name="dumbbell" color={color} size={22} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'History', tabBarIcon: ({ color }) => <Lucide name="clock" color={color} size={22} /> }}
      />
      <Tabs.Screen
        name="progress"
        options={{ title: 'Progress', tabBarIcon: ({ color }) => <Lucide name="rocket" color={color} size={22} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'More', tabBarIcon: ({ color }) => <Lucide name="cog" color={color} size={22} /> }}
      />
    </Tabs>
  );
}
