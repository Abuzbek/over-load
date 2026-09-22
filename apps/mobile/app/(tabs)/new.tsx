/**
 * Placeholder for the tab bar's centre "+" button. It is never navigated to —
 * the tabPress listener in _layout.tsx opens the shortcuts sheet and calls
 * preventDefault. The file exists only because expo-router needs a route to
 * hang a Tabs.Screen (and therefore a tab bar slot) on.
 */
export default function NewShortcutPlaceholder() {
  return null;
}
