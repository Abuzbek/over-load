import { Lucide } from '@react-native-vector-icons/lucide';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { InProgressBar } from '../../src/features/session/InProgressBar';
import { theme } from '../../src/ui/theme';

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
        // header would draw the same word twice — "Dashboard" in the header and
        // "Dashboard" again below it. `title` stays because it also names the tab.
        headerShown: false,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Lucide name="layout-dashboard" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="workout"
        options={{
          title: 'Workout',
          tabBarIcon: ({ color }) => <Lucide name="dumbbell" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color }) => <Lucide name="trending-up" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) => <Lucide name="ellipsis" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
