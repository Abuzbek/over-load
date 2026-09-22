import { Lucide } from '@react-native-vector-icons/lucide';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { InProgressBar } from '../../src/features/session/InProgressBar';
import { ShortcutsSheet } from '../../src/features/shortcuts/ShortcutsSheet';
import { theme } from '../../src/ui/theme';

export default function TabsLayout() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  return (
    <>
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
        {/* Not a destination: the listener below cancels the navigation and opens
            the shortcuts sheet instead. It is a Tabs.Screen only to claim the
            middle slot, so react-navigation lays the other four out around it. */}
        <Tabs.Screen
          name="new"
          options={{
            title: '',
            tabBarButton: (props) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create"
                onPress={props.onPress}
                style={styles.fabSlot}
              >
                <View style={styles.fab}>
                  <Lucide name="plus" size={26} color={theme.colors.onAccent} />
                </View>
              </Pressable>
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setShortcutsOpen(true);
            },
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

      {/* A Modal, so it portals above everything: unlike InProgressBar this can
          safely be a sibling of <Tabs>. */}
      <ShortcutsSheet visible={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  fabSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
