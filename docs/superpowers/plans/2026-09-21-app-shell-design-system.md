# App Shell & Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Overload from a working logger with a six-button home screen into a tabbed app with a coherent visual language, without changing the database schema.

**Architecture:** Design tokens land first because direction "Editorial" already fixes the palette, type scale and spacing — nothing there is guessed. Then the Train tab is built end to end (shell, its components, its queries) and run on both platforms, so the component API is derived from real usage. The remaining screens are then mechanical migrations against a proven kit. The active session is a full-screen route outside the tab group, with a persistent in-progress bar above the tab bar routing back into it.

**Tech Stack:** Expo SDK 52, expo-router 4, React Native 0.76, TypeScript, Drizzle + expo-sqlite, Vitest, pnpm workspaces, expo-font + `@expo-google-fonts/newsreader`.

**Spec:** `docs/superpowers/specs/2026-09-21-app-shell-design-system-design.md`

## Global Constraints

Copied from the spec and `CLAUDE.md`. Every task's requirements implicitly include this section.

- **Weight is always kilograms.** Pounds are display-only. No table stores a unit.
- **Timestamps are integer epoch milliseconds.** Never ISO strings, never `Date` objects.
- **Deletes are tombstones.** Set `deleted_at`; never `DELETE`. **Every read filters `deleted_at IS NULL` at EVERY joined level.** `personal_records` is the sole exemption.
- **`packages/domain` imports nothing** — not React, not expo, not drizzle, and not `@overload/schema`. Helpers there take primitives, never row types.
- **Screens never touch Drizzle.** Type-only imports from `@overload/schema` are fine; query-builder imports are not. All SQL lives in `apps/mobile/src/data/`.
- **Ordering indexes use `max(orderIndex) + 1` over ALL rows including tombstoned.**
- **`sets.completedAt IS NULL` means planned-but-not-performed.** Do not repurpose it.
- **No schema changes in this plan.** No new migrations.
- **`Button` must stay a `forwardRef`.** `<Link asChild>` clones its child and passes a ref; dropping it previously stopped the app launching.
- **No `Alert.prompt`** — iOS-only. Cross-platform `Modal` only.
- **Do not re-enable Metro's `unstable_enablePackageExports`.** See the comment in `apps/mobile/metro.config.js`.
- **Dark theme only.** Tokens are structured so a light variant is a later addition.
- **No shadows.** Depth comes from the `surface` → `surfaceRaised` step.
- Exact token values:
  ```
  background #14120F   surface #1E1B17   surfaceRaised #241E17   border #2E2A24
  text #F5F0E8         textMuted #A39A8C  accent #E8834A          onAccent #14120F
  success #3DD68C      danger #E5484D
  spacing  xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32
  radius   sm 8 · md 14 · lg 20 · pill 999
  ```
- Every task ends green on `pnpm typecheck` and `pnpm test`. Tasks that change packaging or assets also run `pnpm bundle`.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `apps/mobile/src/ui/typography.ts` | `TextVariant` union and the pure `textStyle()` mapping, including serif fallback |
| `apps/mobile/src/ui/typography.test.ts` | Tests for the above |
| `apps/mobile/src/ui/FontsContext.tsx` | Provides `serifLoaded` to the tree |
| `apps/mobile/src/ui/Text.tsx` | Variant-driven text primitive |
| `apps/mobile/src/ui/Screen.tsx` | Safe-area + background wrapper |
| `apps/mobile/src/ui/Card.tsx` | Raised surface container |
| `apps/mobile/src/ui/SectionLabel.tsx` | Uppercase tracked section label |
| `apps/mobile/src/ui/EmptyState.tsx` | Empty-list messaging |
| `apps/mobile/src/ui/StatTile.tsx` | Label + numeric value tile |
| `apps/mobile/src/features/session/useActiveWorkout.ts` | Active-workout state + elapsed ticker |
| `apps/mobile/src/features/session/InProgressBar.tsx` | The bar above the tab bar |
| `packages/domain/src/formatLastTrained.ts` | `formatLastTrained`, `summariseMuscles`, `formatElapsed` |
| `packages/domain/src/formatLastTrained.test.ts` | Tests for the above |
| `apps/mobile/app/(tabs)/_layout.tsx` | Tabs + in-progress bar |
| `apps/mobile/app/(tabs)/index.tsx` | Train |
| `apps/mobile/app/(tabs)/history.tsx` | History |
| `apps/mobile/app/(tabs)/progress.tsx` | Progress (records) |
| `apps/mobile/app/(tabs)/profile.tsx` | Profile (settings) |
| `apps/mobile/src/features/train/TrainScreen.tsx` | Train content |

**Modified**

| File | Change |
|---|---|
| `apps/mobile/src/ui/theme.ts` | New token values; `text` moves to `typography.ts` |
| `apps/mobile/src/ui/Button.tsx` | New variants, tokens; keeps `forwardRef` |
| `apps/mobile/src/ui/ListRow.tsx` | Tokens, optional leading slot |
| `apps/mobile/app/_layout.tsx` | Font loading; Stack styling |
| `apps/mobile/app.json` | `userInterfaceStyle: "dark"` |
| `apps/mobile/package.json` | `expo-font`, `@expo-google-fonts/newsreader` |
| `apps/mobile/src/data/routineRepo.ts` | `listRoutineSummaries` |
| `apps/mobile/src/data/sessionRepo.ts` | `getActiveWorkout` |
| `apps/mobile/src/features/**` | Restyled against the kit |

**Deleted**

| File | Reason |
|---|---|
| `apps/mobile/app/index.tsx` | Replaced by `app/(tabs)/index.tsx` |
| `apps/mobile/app/settings.tsx` | Replaced by `app/(tabs)/profile.tsx` |
| `apps/mobile/app/records.tsx` | Replaced by `app/(tabs)/progress.tsx` |
| `apps/mobile/app/history/index.tsx` | Replaced by `app/(tabs)/history.tsx` |

---

### Task 1: Design tokens and the typography helper

**Files:**
- Modify: `apps/mobile/src/ui/theme.ts`
- Create: `apps/mobile/src/ui/typography.ts`
- Test: `apps/mobile/src/ui/typography.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `theme` (same import path, new values); `type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'numeric'`; `textStyle(variant: TextVariant, serifLoaded: boolean): TextStyleObject` where `TextStyleObject` is `{ fontSize: number; lineHeight: number; fontWeight?: '400'|'600'|'700'; fontFamily?: string; letterSpacing?: number; textTransform?: 'uppercase'; fontVariant?: string[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/ui/typography.test.ts
import { describe, expect, it } from 'vitest';
import { textStyle } from './typography';

describe('textStyle', () => {
  it('uses the bundled serif for display when it is loaded', () => {
    expect(textStyle('display', true).fontFamily).toBe('Newsreader_600SemiBold');
  });

  // A missing font must never block rendering — the screen falls back to the
  // platform's own faces rather than showing nothing.
  it('falls back to the system face for display when the serif failed to load', () => {
    expect(textStyle('display', false).fontFamily).toBeUndefined();
  });

  it('never sets a fontFamily on non-display variants', () => {
    for (const v of ['title', 'heading', 'body', 'label', 'caption', 'numeric'] as const) {
      expect(textStyle(v, true).fontFamily).toBeUndefined();
    }
  });

  // Weights, set counts and the rest timer all change in place. Proportional
  // figures make them jitter as the digits change.
  it('gives the numeric variant tabular figures', () => {
    expect(textStyle('numeric', true).fontVariant).toEqual(['tabular-nums']);
  });

  it('uppercases and tracks the label variant', () => {
    const label = textStyle('label', true);
    expect(label.textTransform).toBe('uppercase');
    expect(label.letterSpacing).toBe(1.4);
  });

  it('gives every variant a line height at least as large as its font size', () => {
    for (const v of ['display', 'title', 'heading', 'body', 'label', 'caption', 'numeric'] as const) {
      const s = textStyle(v, true);
      expect(s.lineHeight).toBeGreaterThanOrEqual(s.fontSize);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/mobile/src/ui/typography.test.ts`
Expected: FAIL — `Failed to load url ./typography`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/mobile/src/ui/typography.ts

/** The one family we bundle. Must match the export from @expo-google-fonts/newsreader. */
export const SERIF_FAMILY = 'Newsreader_600SemiBold';

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'label'
  | 'caption'
  | 'numeric';

export type TextStyleObject = {
  fontSize: number;
  lineHeight: number;
  fontWeight?: '400' | '600' | '700';
  fontFamily?: string;
  letterSpacing?: number;
  textTransform?: 'uppercase';
  fontVariant?: string[];
};

const BASE: Record<TextVariant, TextStyleObject> = {
  display: { fontSize: 30, lineHeight: 34, fontWeight: '600', letterSpacing: -0.5 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  numeric: { fontSize: 15, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
};

/**
 * Only `display` uses the bundled serif — it is the whole identity of the
 * "Editorial" direction. When the font failed to load we return no fontFamily
 * at all, which renders in the platform's default face rather than nothing.
 */
export function textStyle(variant: TextVariant, serifLoaded: boolean): TextStyleObject {
  const base = BASE[variant];
  if (variant === 'display' && serifLoaded) return { ...base, fontFamily: SERIF_FAMILY };
  return { ...base };
}
```

Then replace the token values in `apps/mobile/src/ui/theme.ts`, removing the old `text` key (typography now owns it):

```ts
// apps/mobile/src/ui/theme.ts
export const theme = {
  colors: {
    background: '#14120F',
    surface: '#1E1B17',
    surfaceRaised: '#241E17',
    border: '#2E2A24',
    text: '#F5F0E8',
    textMuted: '#A39A8C',
    accent: '#E8834A',
    onAccent: '#14120F',
    success: '#3DD68C',
    danger: '#E5484D',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 14, lg: 20, pill: 999 },
};
```

Removing `theme.text` breaks every current consumer. Fix them mechanically in this step by replacing `...theme.text.title` with `...textStyle('title', true)` and so on — `grep -rn "theme.text" apps/mobile/src apps/mobile/app`. Task 3 replaces these call sites with the `<Text>` component; passing `true` here is a deliberate placeholder that Task 3 removes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run apps/mobile/src/ui/typography.test.ts` → PASS (6 tests)
Run: `pnpm typecheck && pnpm test` → both clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/ui/
git commit -m "feat(ui): add Editorial design tokens and the typography scale"
```

---

### Task 2: Bundle the serif and load it without blocking launch

**Files:**
- Modify: `apps/mobile/package.json`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app.json`
- Create: `apps/mobile/src/ui/FontsContext.tsx`

**Interfaces:**
- Consumes: `textStyle` (Task 1).
- Produces: `FontsProvider` (props: `{ serifLoaded: boolean; children: ReactNode }`) and `useSerifLoaded(): boolean`.

- [ ] **Step 1: Install the dependencies**

```bash
cd apps/mobile && npx expo install expo-font @expo-google-fonts/newsreader
```

Both **must** appear in `apps/mobile/package.json` `dependencies`. Under pnpm's strict linking, a package that is merely transitively present will not resolve — this is exactly how `babel-preset-expo`, `@babel/runtime` and `query-string` previously broke the bundle.

- [ ] **Step 2: Write the context**

```tsx
// apps/mobile/src/ui/FontsContext.tsx
import { createContext, useContext, type ReactNode } from 'react';

const FontsContext = createContext(false);

export function FontsProvider({ serifLoaded, children }: { serifLoaded: boolean; children: ReactNode }) {
  return <FontsContext.Provider value={serifLoaded}>{children}</FontsContext.Provider>;
}

/** False when the bundled serif failed to load; callers fall back, never block. */
export function useSerifLoaded(): boolean {
  return useContext(FontsContext);
}
```

- [ ] **Step 3: Load the font in the root layout**

In `apps/mobile/app/_layout.tsx`, add alongside the existing bootstrap gate:

```tsx
import { Newsreader_600SemiBold, useFonts } from '@expo-google-fonts/newsreader';
import { FontsProvider } from '../src/ui/FontsContext';

// inside RootLayout, before the early returns:
const [fontsLoaded, fontError] = useFonts({ Newsreader_600SemiBold });

// Hold the splash only until the font resolves OR fails. A font is cosmetic;
// it must never be able to brick launch, for the same reason the personal-record
// rebuild is wrapped — see bd63d5b.
if (!fontsLoaded && !fontError) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.colors.text} />
    </View>
  );
}
```

Then wrap the returned `<Stack>` in `<FontsProvider serifLoaded={fontsLoaded && !fontError}>`, and update the `Stack` `screenOptions` to the new tokens (`headerStyle.backgroundColor: theme.colors.surface`, `headerTintColor: theme.colors.text`, `contentStyle.backgroundColor: theme.colors.background`).

- [ ] **Step 4: Restyle the bootstrap error screen**

`RootLayout` already renders a "Database error" screen when `initializeDatabase`
rejects. Restyle its `styles` block against the new tokens and leave its
**behaviour exactly as is** — including the `error.restored` branch that tells
the user whether their data survived. That message is the only signal a restore
happened; do not reword or reorder it.

- [ ] **Step 5: Set the app to dark**

In `apps/mobile/app.json`, change `"userInterfaceStyle": "automatic"` to `"dark"`. The app has no light theme; leaving it automatic lets the OS tint native surfaces (pickers, action sheets, the keyboard) light against a dark app.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm test && pnpm bundle` — all clean. The bundle step is not optional here: this task changes the asset pipeline.

Run `pnpm ios`, confirm the app launches and the header renders in the new warm palette.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.json apps/mobile/app/_layout.tsx apps/mobile/src/ui/FontsContext.tsx pnpm-lock.yaml
git commit -m "feat(ui): bundle the Newsreader serif and load it without blocking launch"
```

---

### Task 3: Text and Screen primitives

**Files:**
- Create: `apps/mobile/src/ui/Text.tsx`, `apps/mobile/src/ui/Screen.tsx`

**Interfaces:**
- Consumes: `textStyle`, `TextVariant` (Task 1); `useSerifLoaded` (Task 2).
- Produces: `<Text variant color style numberOfLines>` and `<Screen scroll padded>`.

- [ ] **Step 1: Write the Text component**

```tsx
// apps/mobile/src/ui/Text.tsx
import { Text as RNText, type StyleProp, type TextStyle } from 'react-native';
import type { ReactNode } from 'react';
import { useSerifLoaded } from './FontsContext';
import { theme } from './theme';
import { textStyle, type TextVariant } from './typography';

type Props = {
  children: ReactNode;
  variant?: TextVariant;
  color?: keyof typeof theme.colors;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export function Text({ children, variant = 'body', color = 'text', style, numberOfLines }: Props) {
  const serifLoaded = useSerifLoaded();
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[textStyle(variant, serifLoaded) as TextStyle, { color: theme.colors[color] }, style]}
    >
      {children}
    </RNText>
  );
}
```

- [ ] **Step 2: Write the Screen component**

```tsx
// apps/mobile/src/ui/Screen.tsx
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { theme } from './theme';

type Props = { children: ReactNode; scroll?: boolean; padded?: boolean };

export function Screen({ children, scroll = false, padded = true }: Props) {
  const inner = padded ? styles.padded : undefined;
  if (scroll) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={[inner, styles.grow]}>
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.root, inner]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  padded: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  grow: { flexGrow: 1 },
});
```

Safe-area insets are handled by the navigator (expo-router already renders inside `react-native-safe-area-context`), so `Screen` deliberately does not add its own — doubling them was the cause of the rest-timer inset fix in 9380103.

- [ ] **Step 3: Replace the placeholder textStyle call sites**

`grep -rn "textStyle(" apps/mobile/src apps/mobile/app` — every site introduced in Task 1 Step 3 that passes a literal `true`. Replace those components' raw `<RNText>` usage with `<Text variant=...>` where it is a straight swap; leave the rest for the per-screen migration tasks.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test` → clean. Run `pnpm ios` and confirm the app still renders.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/ui/
git commit -m "feat(ui): add Text and Screen primitives"
```

---

### Task 4: Button, Card, ListRow, SectionLabel, EmptyState, StatTile, Sheet, NumericField

**Files:**
- Modify: `apps/mobile/src/ui/Button.tsx`, `apps/mobile/src/ui/ListRow.tsx`
- Create: `apps/mobile/src/ui/Card.tsx`, `apps/mobile/src/ui/SectionLabel.tsx`, `apps/mobile/src/ui/EmptyState.tsx`, `apps/mobile/src/ui/StatTile.tsx`, `apps/mobile/src/ui/Sheet.tsx`, `apps/mobile/src/ui/NumericField.tsx`

**Interfaces:**
- Consumes: `Text` (Task 3), `theme` (Task 1).
- Produces:
  - `<Button title onPress variant? disabled?>` with `variant: 'primary' | 'secondary' | 'ghost' | 'destructive'`
  - `<Card children style?>`, `<SectionLabel>text</SectionLabel>`
  - `<EmptyState title body? action?>` where `action` is `{ title: string; onPress: () => void }`
  - `<StatTile label value caption?>`
  - `<Sheet visible onRequestClose title body? children>`
  - `<NumericField value onChangeText placeholder keyboard editable? accessibilityLabel>`

- [ ] **Step 1: Rewrite Button against the tokens**

```tsx
// apps/mobile/src/ui/Button.tsx
import { forwardRef } from 'react';
import { Pressable, StyleSheet, type View } from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Props = { title: string; onPress?: () => void; variant?: Variant; disabled?: boolean };

// forwardRef is required: expo-router's <Link asChild> clones its child and
// passes a ref. A plain function component drops it. This previously stopped
// the app launching, and a code review looked at the pattern and called it fine.
export const Button = forwardRef<View, Props>(function Button(
  { title, onPress, variant = 'primary', disabled = false },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text variant="heading" color={variant === 'primary' ? 'onAccent' : variant === 'destructive' ? 'danger' : 'text'}>
        {title}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primary: { backgroundColor: theme.colors.accent },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border },
  ghost: { backgroundColor: 'transparent' },
  destructive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.danger },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
```

`minHeight: 48` is a deliberate floor — the set checkmark and tab targets must stay thumb-sized on both platforms.

- [ ] **Step 2: Write Card, SectionLabel, EmptyState, StatTile**

```tsx
// apps/mobile/src/ui/Card.tsx
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// No shadow: iOS shadow* and Android elevation diverge in appearance and cost.
// Depth is the surface -> surfaceRaised step instead.
const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
});
```

```tsx
// apps/mobile/src/ui/SectionLabel.tsx
import { Text } from './Text';

export function SectionLabel({ children }: { children: string }) {
  return <Text variant="label" color="textMuted">{children}</Text>;
}
```

```tsx
// apps/mobile/src/ui/EmptyState.tsx
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';
import { theme } from './theme';

type Props = { title: string; body?: string; action?: { title: string; onPress: () => void } };

export function EmptyState({ title, body, action }: Props) {
  return (
    <View style={styles.wrap}>
      <Text variant="title">{title}</Text>
      {body ? <Text color="textMuted" style={styles.centered}>{body}</Text> : null}
      {action ? <Button title={action.title} onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  centered: { textAlign: 'center' },
});
```

```tsx
// apps/mobile/src/ui/StatTile.tsx
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

export function StatTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <View style={styles.tile}>
      <Text variant="label" color="textMuted">{label}</Text>
      <Text variant="numeric" style={styles.value}>{value}</Text>
      {caption ? <Text variant="caption" color="textMuted">{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  value: { fontSize: 22, lineHeight: 28 },
});
```

- [ ] **Step 3: Write Sheet and NumericField**

`Sheet` is the one place the cross-platform modal lives. The stranded-workout
dialog is currently duplicated in `app/index.tsx` and `RoutineBuilder.tsx`; both
collapse onto this in Tasks 11 and 15.

```tsx
// apps/mobile/src/ui/Sheet.tsx
import type { ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { theme } from './theme';

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  body?: string;
  children: ReactNode; // the action buttons
};

// A Modal, never Alert: Alert.prompt is iOS-only and Alert's button semantics
// are iOS-shaped. This app ships Android too (R19).
export function Sheet({ visible, onRequestClose, title, body, children }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text variant="title">{title}</Text>
          {body ? <Text color="textMuted">{body}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
});
```

```tsx
// apps/mobile/src/ui/NumericField.tsx
import { StyleSheet, TextInput } from 'react-native';
import { useSerifLoaded } from './FontsContext';
import { theme } from './theme';
import { textStyle } from './typography';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboard: 'decimal-pad' | 'number-pad';
  editable?: boolean;
  accessibilityLabel: string;
};

/**
 * Every weight, rep and duration box. Tabular figures so a value does not
 * shift its own box as digits change, and a 48pt floor so it stays tappable
 * with one thumb mid-set.
 */
export function NumericField({
  value, onChangeText, placeholder, keyboard, editable = true, accessibilityLabel,
}: Props) {
  const serifLoaded = useSerifLoaded();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboard}
      editable={editable}
      accessibilityLabel={accessibilityLabel}
      placeholderTextColor={theme.colors.textMuted}
      style={[
        textStyle('numeric', serifLoaded),
        styles.field,
        !editable && styles.locked,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    minHeight: 48,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    textAlign: 'center',
  },
  // A completed set's inputs lock: an edit after checking would reach React
  // state but never the database (R22).
  locked: { color: theme.colors.textMuted, opacity: 0.7 },
});
```

- [ ] **Step 4: Update ListRow to the tokens**

In `apps/mobile/src/ui/ListRow.tsx`, add an optional `leading?: ReactNode` slot before `main`, and replace the raw `<Text>` usages with the `Text` component (`variant="heading"` for title, `variant="caption" color="textMuted"` for subtitle). Keep the existing `accessibilityRole={onPress ? 'button' : undefined}` logic exactly — a presentational row must not announce as activatable.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm test` → clean. Run `pnpm ios`; every existing screen still renders, now in the warm palette.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/ui/
git commit -m "feat(ui): restyle the component kit against the Editorial tokens"
```

---

### Task 5: First Android build

This task ships no feature. It exists because Android has **never been built once** in this project, four cross-platform defects have already shipped, and Tasks 1–4 just added a bundled font and changed the asset pipeline. Finding out now costs an afternoon; finding out after six screens depend on it costs far more.

**Files:** whatever the build forces. Expect `apps/mobile/app.json`, `apps/mobile/android/*` (generated), possibly `package.json`.

- [ ] **Step 1: Build and launch**

```bash
pnpm android
```

An emulator is available (`~/Library/Android/sdk/emulator/emulator -list-avds` → `Medium_Phone_API_36.0`), and `adb` is at `~/Library/Android/sdk/platform-tools/adb`.

- [ ] **Step 2: Work the launch checklist**

Confirm, on Android specifically:
- The app launches; migrations run; 743 exercises seed.
- The **bundled serif actually renders** — compare a screen title against iOS. A font that silently fails to load shows the system face, which is easy to miss.
- The header and background use the warm palette, not a light OS default (this is what `userInterfaceStyle: "dark"` in Task 2 guards).
- `PRAGMA foreign_keys = ON` does not break first launch.

- [ ] **Step 3: Record what it took**

Append an "Android" section to `docs/superpowers/2026-09-20-device-verification.md` covering: SDK/Gradle versions, anything that had to be installed, any config that changed, and what is confirmed working. The next session should not have to rediscover this.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(android): first Android build, and what it took"
```

---

### Task 6: Date, muscle and elapsed helpers in the domain package

**Files:**
- Create: `packages/domain/src/formatLastTrained.ts`
- Test: `packages/domain/src/formatLastTrained.test.ts`
- Modify: `packages/domain/src/index.ts` (add `export * from './formatLastTrained';`)

**Interfaces:**
- Consumes: nothing. **This package imports nothing** — these take primitives, never row types.
- Produces:
  - `formatLastTrained(lastTrainedAt: number | null, now: number): string`
  - `summariseMuscles(primaryMuscles: string[], max: number): string[]`
  - `formatElapsed(ms: number): string`

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/formatLastTrained.test.ts
import { describe, expect, it } from 'vitest';
import { formatElapsed, formatLastTrained, summariseMuscles } from './formatLastTrained';

const DAY = 86_400_000;
// 2026-09-21T12:00:00Z, a Monday.
const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);

describe('formatLastTrained', () => {
  it('says Never when the routine has never been trained', () => {
    expect(formatLastTrained(null, NOW)).toBe('Never');
  });

  it('says Today for earlier the same day', () => {
    expect(formatLastTrained(NOW - 3 * 3_600_000, NOW)).toBe('Today');
  });

  it('says Yesterday for one day back', () => {
    expect(formatLastTrained(NOW - DAY, NOW)).toBe('Yesterday');
  });

  it('names the weekday within the last week', () => {
    expect(formatLastTrained(NOW - 3 * DAY, NOW)).toBe('Friday');
  });

  it('counts weeks beyond that', () => {
    expect(formatLastTrained(NOW - 21 * DAY, NOW)).toBe('3 weeks ago');
  });

  it('uses the singular for exactly one week', () => {
    expect(formatLastTrained(NOW - 8 * DAY, NOW)).toBe('1 week ago');
  });

  it('switches to months past eight weeks', () => {
    expect(formatLastTrained(NOW - 70 * DAY, NOW)).toBe('2 months ago');
  });
});

describe('summariseMuscles', () => {
  it('removes duplicates while preserving order', () => {
    expect(summariseMuscles(['chest', 'triceps', 'chest', 'shoulders'], 3))
      .toEqual(['chest', 'triceps', 'shoulders']);
  });

  it('caps the list at max', () => {
    expect(summariseMuscles(['chest', 'triceps', 'shoulders', 'back'], 2))
      .toEqual(['chest', 'triceps']);
  });

  it('returns an empty list for no muscles', () => {
    expect(summariseMuscles([], 3)).toEqual([]);
  });
});

describe('formatElapsed', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatElapsed(12 * 60_000 + 4_000)).toBe('12:04');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatElapsed(3_600_000 + 2 * 60_000 + 33_000)).toBe('1:02:33');
  });

  it('never goes negative when the clock moves backwards', () => {
    expect(formatElapsed(-5_000)).toBe('0:00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/src/formatLastTrained.test.ts`
Expected: FAIL — `Failed to load url ./formatLastTrained`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/domain/src/formatLastTrained.ts

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Calendar-day difference, not elapsed milliseconds: a workout at 23:00
 * yesterday is "Yesterday" at 01:00 today, even though only two hours passed.
 */
function calendarDaysBetween(earlier: number, later: number): number {
  const a = new Date(earlier);
  const b = new Date(later);
  const aMidnight = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bMidnight = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bMidnight - aMidnight) / DAY_MS);
}

export function formatLastTrained(lastTrainedAt: number | null, now: number): string {
  if (lastTrainedAt === null) return 'Never';

  const days = calendarDaysBetween(lastTrainedAt, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return WEEKDAYS[new Date(lastTrainedAt).getUTCDay()]!;

  const weeks = Math.floor(days / 7);
  if (weeks <= 8) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;

  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

/** Distinct, order-preserving, capped. Takes strings so domain stays dependency-free. */
export function summariseMuscles(primaryMuscles: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const muscle of primaryMuscles) {
    if (seen.has(muscle)) continue;
    seen.add(muscle);
    out.push(muscle);
    if (out.length === max) break;
  }
  return out;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours === 0) return `${minutes}:${ss}`;
  return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/domain/src/formatLastTrained.test.ts` → PASS (13 tests)
Run: `pnpm typecheck && pnpm test` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/
git commit -m "feat(domain): add last-trained, muscle-summary and elapsed formatting"
```

---

### Task 7: `listRoutineSummaries`

**Files:**
- Modify: `apps/mobile/src/data/routineRepo.ts`
- Test: `apps/mobile/src/data/routineRepo.test.ts`

**Interfaces:**
- Consumes: `@overload/schema` tables.
- Produces:
  ```ts
  export type RoutineSummary = {
    routine: Routine;
    exerciseCount: number;
    lastTrainedAt: number | null;
    primaryMuscles: string[];
  };
  export function listRoutineSummaries(db: Db): RoutineSummary[];
  ```

This query spans **four joined levels** — `routines`, `routine_exercises`, `exercises`, `workouts`. A missing `deleted_at IS NULL` at any one is the defect that hit five separate queries during the original build, so it gets a tombstone test **per level**.

- [ ] **Step 1: Write the failing tests**

Append to `apps/mobile/src/data/routineRepo.test.ts`:

```ts
import { workouts } from '@overload/schema';
import { listRoutineSummaries } from './routineRepo';

describe('listRoutineSummaries', () => {
  it('counts live exercises and lists their primary muscles in order', () => {
    const routine = createRoutine(db, 'Push Day');
    addExerciseToRoutine(db, routine.id, bench.id);
    addExerciseToRoutine(db, routine.id, squat.id);

    const [summary] = listRoutineSummaries(db);
    expect(summary!.exerciseCount).toBe(2);
    expect(summary!.primaryMuscles).toEqual(['chest', 'quads']);
    expect(summary!.lastTrainedAt).toBeNull();
  });

  it('reports the most recent finished workout as lastTrainedAt', () => {
    const routine = createRoutine(db, 'Push Day');
    const ts = now();
    db.insert(workouts).values([
      { id: newId(), routineId: routine.id, name: 'Push Day', startedAt: ts - 5000, endedAt: ts - 4000 },
      { id: newId(), routineId: routine.id, name: 'Push Day', startedAt: ts - 1000, endedAt: ts },
    ]).run();

    expect(listRoutineSummaries(db)[0]!.lastTrainedAt).toBe(ts - 1000);
  });

  it('ignores a workout that is still in progress', () => {
    const routine = createRoutine(db, 'Push Day');
    db.insert(workouts).values({
      id: newId(), routineId: routine.id, name: 'Push Day', startedAt: now(), endedAt: null,
    }).run();

    expect(listRoutineSummaries(db)[0]!.lastTrainedAt).toBeNull();
  });

  // --- one tombstone test per joined level ---

  it('level 1: excludes a tombstoned routine', () => {
    const routine = createRoutine(db, 'Push Day');
    softDeleteRoutine(db, routine.id);
    expect(listRoutineSummaries(db)).toHaveLength(0);
  });

  it('level 2: does not count a tombstoned routine_exercise', () => {
    const routine = createRoutine(db, 'Push Day');
    const entry = addExerciseToRoutine(db, routine.id, bench.id);
    addExerciseToRoutine(db, routine.id, squat.id);
    db.update(routineExercises).set({ deletedAt: now() }).where(eq(routineExercises.id, entry.id)).run();

    const [summary] = listRoutineSummaries(db);
    expect(summary!.exerciseCount).toBe(1);
    expect(summary!.primaryMuscles).toEqual(['quads']);
  });

  it('level 3: does not count an entry whose exercise is tombstoned', () => {
    const routine = createRoutine(db, 'Push Day');
    addExerciseToRoutine(db, routine.id, bench.id);
    addExerciseToRoutine(db, routine.id, squat.id);
    db.update(exercises).set({ deletedAt: now() }).where(eq(exercises.id, bench.id)).run();

    const [summary] = listRoutineSummaries(db);
    expect(summary!.exerciseCount).toBe(1);
    expect(summary!.primaryMuscles).toEqual(['quads']);
  });

  it('level 4: ignores a tombstoned workout when computing lastTrainedAt', () => {
    const routine = createRoutine(db, 'Push Day');
    const ts = now();
    const kept = newId();
    const dropped = newId();
    db.insert(workouts).values([
      { id: kept, routineId: routine.id, name: 'Push Day', startedAt: ts - 5000, endedAt: ts - 4000 },
      { id: dropped, routineId: routine.id, name: 'Push Day', startedAt: ts - 1000, endedAt: ts },
    ]).run();
    db.update(workouts).set({ deletedAt: ts }).where(eq(workouts.id, dropped)).run();

    expect(listRoutineSummaries(db)[0]!.lastTrainedAt).toBe(ts - 5000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/mobile/src/data/routineRepo.test.ts`
Expected: FAIL — `listRoutineSummaries is not a function`.

- [ ] **Step 3: Write the implementation**

Add to `apps/mobile/src/data/routineRepo.ts`:

```ts
import { summariseMuscles } from '@overload/domain';
import { workouts } from '@overload/schema';

export type RoutineSummary = {
  routine: Routine;
  exerciseCount: number;
  lastTrainedAt: number | null;
  primaryMuscles: string[];
};

/**
 * One grouped read per concern rather than a query per routine. lastPerformance
 * already shows what the per-row loop costs, and it is a known deferred minor.
 *
 * Four levels carry a tombstone filter: routines, routine_exercises, exercises
 * and workouts. Dropping any one of them silently changes the numbers on the
 * Train screen rather than throwing.
 */
export function listRoutineSummaries(db: Db): RoutineSummary[] {
  const live = listRoutines(db); // already filters routines.deletedAt

  const entries = db
    .select({
      routineId: routineExercises.routineId,
      orderIndex: routineExercises.orderIndex,
      primaryMuscle: exercises.primaryMuscle,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
    .where(and(isNull(routineExercises.deletedAt), isNull(exercises.deletedAt)))
    .orderBy(asc(routineExercises.orderIndex))
    .all();

  const lastTrained = db
    .select({ routineId: workouts.routineId, lastAt: max(workouts.startedAt) })
    .from(workouts)
    .where(and(isNull(workouts.deletedAt), isNotNull(workouts.endedAt)))
    .groupBy(workouts.routineId)
    .all();

  const lastByRoutine = new Map(lastTrained.map((r) => [r.routineId, r.lastAt ?? null]));

  return live.map((routine) => {
    const mine = entries.filter((e) => e.routineId === routine.id);
    return {
      routine,
      exerciseCount: mine.length,
      lastTrainedAt: lastByRoutine.get(routine.id) ?? null,
      primaryMuscles: summariseMuscles(mine.map((e) => e.primaryMuscle), 3),
    };
  });
}
```

Add `isNotNull` to the existing `drizzle-orm` import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run apps/mobile/src/data/routineRepo.test.ts` → PASS
Run: `pnpm typecheck && pnpm test` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/data/
git commit -m "feat(data): add listRoutineSummaries for the Train screen"
```

---

### Task 8: `getActiveWorkout`

**Files:**
- Modify: `apps/mobile/src/data/sessionRepo.ts`
- Test: `apps/mobile/src/data/sessionRepo.start.test.ts`

**Interfaces:**
- Produces: `export function getActiveWorkout(db: Db): Workout | undefined;`

The in-progress bar needs the workout's `name` and `startedAt`, which `getActiveWorkoutId` does not return.

- [ ] **Step 1: Write the failing test**

Append to `apps/mobile/src/data/sessionRepo.start.test.ts`:

```ts
describe('getActiveWorkout', () => {
  it('returns undefined when nothing is in progress', () => {
    expect(getActiveWorkout(db)).toBeUndefined();
  });

  it('returns the unfinished workout with its name and start time', () => {
    const at = now();
    const id = startEmptyWorkout(db, 'Empty workout', at);
    const active = getActiveWorkout(db);
    expect(active?.id).toBe(id);
    expect(active?.name).toBe('Empty workout');
    expect(active?.startedAt).toBe(at);
  });

  it('returns undefined once the workout is finished', () => {
    const id = startEmptyWorkout(db, 'Empty workout', now());
    finishWorkout(db, id, now());
    expect(getActiveWorkout(db)).toBeUndefined();
  });

  it('returns undefined for a discarded workout', () => {
    const id = startEmptyWorkout(db, 'Empty workout', now());
    discardWorkout(db, id, now());
    expect(getActiveWorkout(db)).toBeUndefined();
  });

  // Matches getActiveWorkoutId: newest wins, which is what the resume banner
  // and the stranded-workout guard both already assume.
  it('returns the newest unfinished workout when several exist', () => {
    startEmptyWorkout(db, 'Older', now() - 10_000);
    const newer = startEmptyWorkout(db, 'Newer', now());
    expect(getActiveWorkout(db)?.id).toBe(newer);
  });
});
```

Import `getActiveWorkout` in that file's import block.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/mobile/src/data/sessionRepo.start.test.ts`
Expected: FAIL — `getActiveWorkout is not a function`.

- [ ] **Step 3: Write the implementation**

In `apps/mobile/src/data/sessionRepo.ts`, beside `getActiveWorkoutId`:

```ts
/**
 * The row, not just the id — the in-progress bar needs name and startedAt.
 * Same predicate as getActiveWorkoutId so the two can never disagree about
 * which workout is active.
 */
export function getActiveWorkout(db: Db): Workout | undefined {
  return db
    .select()
    .from(workouts)
    .where(and(isNull(workouts.deletedAt), isNull(workouts.endedAt)))
    .orderBy(desc(workouts.startedAt))
    .limit(1)
    .get();
}
```

Import the `Workout` type from `@overload/schema` if not already imported.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run apps/mobile/src/data/sessionRepo.start.test.ts` → PASS
Run: `pnpm typecheck && pnpm test` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/data/
git commit -m "feat(data): add getActiveWorkout for the in-progress bar"
```

---

### Task 9: Tab shell

**Files:**
- Create: `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/(tabs)/history.tsx`, `apps/mobile/app/(tabs)/progress.tsx`, `apps/mobile/app/(tabs)/profile.tsx`
- Delete: `apps/mobile/app/index.tsx`, `apps/mobile/app/settings.tsx`, `apps/mobile/app/records.tsx`, `apps/mobile/app/history/index.tsx`

**Interfaces:**
- Consumes: existing feature components (`HistoryList`, `RecordsList`, `SettingsScreen`).
- Produces: routes `/`, `/history`, `/progress`, `/profile`. `/session/[id]` stays outside the group.

This task moves screens without redesigning them — each tab is a thin wrapper over the content that exists today. Redesign happens in Tasks 11–16, so that a navigation regression and a visual regression never have to be debugged at the same time.

- [ ] **Step 1: Write the tab layout**

```tsx
// apps/mobile/app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { theme } from '../../src/ui/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Train' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
```

Icons are added in Task 10 along with the in-progress bar, so this step stays a pure navigation change.

The scene background is deliberately **not** set here. The prop for it differs
between React Navigation versions (`sceneStyle` vs `sceneContainerStyle`), and
guessing wrong fails silently as a white flash between tabs. `Screen` already
paints `theme.colors.background`; if a flash still shows on either platform,
fix it then, with the prop name the installed version actually documents.

- [ ] **Step 2: Move the screens**

- `app/(tabs)/index.tsx` — move the body of `app/index.tsx` verbatim, deleting its `<Stack.Screen options={{ title: 'Overload' }} />` (the tab layout owns the title now).
- `app/(tabs)/history.tsx` — the body of `app/history/index.tsx`.
- `app/(tabs)/progress.tsx` — the body of `app/records.tsx`.
- `app/(tabs)/profile.tsx` — the body of `app/settings.tsx`.

Delete the four originals. Keep `app/history/[id].tsx`, `app/exercises.tsx`, `app/routines/*` and `app/session/*` exactly where they are — they are pushed on top of the tabs.

- [ ] **Step 3: Fix the internal links**

`grep -rn 'href="/records"\|href="/settings"\|"/history"' apps/mobile` — update `/records` to `/progress` and `/settings` to `/profile`. The old home screen's six `<Link>` buttons for History, Records and Settings are now redundant; delete those three, keeping Routines, Start empty workout and Browse exercises.

- [ ] **Step 4: Verify on both platforms**

Run `pnpm ios` and `pnpm android`. Confirm on each: four tabs appear and switch; starting a workout pushes a full-screen session **with no tab bar**; finishing returns to Train with no back button; the deep link `xcrun simctl openurl booted "overload://progress"` lands on the Progress tab.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mobile/app
git commit -m "feat(nav): move to a four-tab shell with the session outside the tabs"
```

---

### Task 10: `useActiveWorkout` and the in-progress bar

**Files:**
- Create: `apps/mobile/src/features/session/useActiveWorkout.ts`, `apps/mobile/src/features/session/InProgressBar.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `getActiveWorkout` (Task 8), `formatElapsed` (Task 6).
- Produces: `useActiveWorkout(): { workout: Workout | undefined; elapsedMs: number }`, `<InProgressBar />`.

- [ ] **Step 1: Write the hook**

```ts
// apps/mobile/src/features/session/useActiveWorkout.ts
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { getActiveWorkout } from '../../data/sessionRepo';
import { db } from '../../db/client';

/**
 * The active workout plus a live elapsed time.
 *
 * Elapsed is derived from startedAt on every tick rather than accumulated,
 * for the same reason the rest timer is: an interval stops when the OS
 * suspends the app, a timestamp does not.
 *
 * The interval only runs while a workout exists. An always-on ticker behind
 * every tab is battery spend for nothing.
 */
export function useActiveWorkout() {
  const [version, setVersion] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      setVersion((v) => v + 1);
    }, []),
  );

  const workout = getActiveWorkout(db);
  void version; // re-read on focus

  useEffect(() => {
    if (!workout) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [workout?.id]);

  return { workout, elapsedMs: workout ? nowMs - workout.startedAt : 0 };
}
```

- [ ] **Step 2: Write the bar**

```tsx
// apps/mobile/src/features/session/InProgressBar.tsx
import { formatElapsed } from '@overload/domain';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { useActiveWorkout } from './useActiveWorkout';

export function InProgressBar() {
  const { workout, elapsedMs } = useActiveWorkout();
  if (!workout) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Resume ${workout.name}, ${formatElapsed(elapsedMs)} elapsed`}
      onPress={() => router.push(`/session/${workout.id}`)}
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
    >
      <View style={styles.dot} />
      <Text variant="heading" style={styles.name} numberOfLines={1}>{workout.name}</Text>
      <Text variant="numeric" color="textMuted">{formatElapsed(elapsedMs)}</Text>
      <Text variant="heading" color="accent">Resume</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surfaceRaised,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  pressed: { opacity: 0.7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accent },
  name: { flex: 1 },
});
```

- [ ] **Step 3: Mount it above the tab bar**

In `app/(tabs)/_layout.tsx`, wrap the `<Tabs>` so the bar sits between content and the tab bar:

```tsx
import { View, StyleSheet } from 'react-native';
import { InProgressBar } from '../../src/features/session/InProgressBar';

// in the component:
return (
  <View style={styles.root}>
    <Tabs {...existing props} />
    <InProgressBar />
  </View>
);

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: theme.colors.background } });
```

Also add `tabBarIcon` to each `Tabs.Screen`, using a `<Text>` glyph rather than adding an icon dependency: Train `◈`, History `◷`, Progress `◭`, Profile `◉`.

- [ ] **Step 4: Verify on both platforms**

Start a workout, switch tabs — the bar stays visible and the timer keeps counting on every tab. Finish the workout — the bar disappears. Discard from the routine builder — the bar disappears on next focus. Confirm the bar does **not** render on the session screen itself (it is outside the tab group).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/session apps/mobile/app/\(tabs\)/_layout.tsx
git commit -m "feat(nav): add the persistent in-progress workout bar"
```

---

### Task 11: Train screen

**Files:**
- Create: `apps/mobile/src/features/train/TrainScreen.tsx`
- Modify: `apps/mobile/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `listRoutineSummaries` (Task 7), `formatLastTrained`/`summariseMuscles` (Task 6), the kit (Tasks 3–4).

- [ ] **Step 1: Build the screen**

```tsx
// apps/mobile/src/features/train/TrainScreen.tsx
import { formatLastTrained } from '@overload/domain';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { listRoutineSummaries, type RoutineSummary } from '../../data/routineRepo';
import { discardWorkout, getActiveWorkoutId, startEmptyWorkout } from '../../data/sessionRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { Screen } from '../../ui/Screen';
import { SectionLabel } from '../../ui/SectionLabel';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

function RoutineCard({ summary }: { summary: RoutineSummary }) {
  const { routine, exerciseCount, lastTrainedAt, primaryMuscles } = summary;
  const count = `${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${routine.name}, ${count}`}
      onPress={() => router.push(`/routines/${routine.id}`)}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card>
        <Text variant="title">{routine.name}</Text>
        <Text variant="caption" color="textMuted">
          {count} · {formatLastTrained(lastTrainedAt, Date.now())}
        </Text>
        {primaryMuscles.length > 0 ? (
          <Text variant="caption" color="textMuted">{primaryMuscles.join(' · ')}</Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

export function TrainScreen() {
  // Bumping this forces a re-read of listRoutineSummaries. useFocusEffect bumps
  // it when the screen regains focus, since the builder and the session mutate
  // this data and navigate back, leaving this screen mounted underneath.
  // Do NOT switch this to key={version} — that remounts and resets scroll (6b249e9).
  const [, setVersion] = useState(0);
  const [blockingWorkoutId, setBlockingWorkoutId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => setVersion((v) => v + 1), []));

  const summaries = listRoutineSummaries(db);

  const startEmpty = useCallback(() => {
    setBlockingWorkoutId(null);
    const workoutId = startEmptyWorkout(db, 'Empty workout', Date.now());
    router.push(`/session/${workoutId}`);
  }, []);

  const onStartEmptyPressed = useCallback(() => {
    // getActiveWorkoutId only ever returns the newest unfinished workout, so
    // starting a second one strands the first: no endedAt keeps it out of
    // history, and a newer sibling keeps it out of resume.
    const active = getActiveWorkoutId(db);
    if (active) return setBlockingWorkoutId(active);
    startEmpty();
  }, [startEmpty]);

  return (
    <Screen scroll>
      <Text variant="display">Train</Text>

      <SectionLabel>Your routines</SectionLabel>
      {summaries.length === 0 ? (
        <EmptyState
          title="No routines yet"
          body="Build one and it will show up here, with the last time you trained it."
          action={{ title: 'New routine', onPress: () => router.push('/routines') }}
        />
      ) : (
        <View style={styles.list}>
          {summaries.map((s) => <RoutineCard key={s.routine.id} summary={s} />)}
        </View>
      )}

      {/* Always present, not only in the empty state: the cards route to a
          single routine, so without this there is no way to reach the routine
          list and create a second one. */}
      <Button title="New routine" variant="secondary" onPress={() => router.push('/routines')} />
      <Button title="Start empty workout" variant="secondary" onPress={onStartEmptyPressed} />
      <Button title="Browse exercises" variant="secondary" onPress={() => router.push('/exercises')} />

      <Sheet
        visible={blockingWorkoutId !== null}
        onRequestClose={() => setBlockingWorkoutId(null)}
        title="A workout is already in progress"
        body="Resume it, or discard it and start an empty workout instead. Discarding keeps nothing from the unfinished workout."
      >
        <Button
          title="Resume it"
          onPress={() => {
            const active = blockingWorkoutId;
            setBlockingWorkoutId(null);
            if (active) router.push(`/session/${active}`);
          }}
        />
        <Button
          title="Discard it and start"
          variant="destructive"
          onPress={() => {
            if (blockingWorkoutId) discardWorkout(db, blockingWorkoutId, Date.now());
            startEmpty();
          }}
        />
        <Button title="Cancel" variant="secondary" onPress={() => setBlockingWorkoutId(null)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.md },
  pressed: { opacity: 0.7 },
});
```

Then `app/(tabs)/index.tsx` becomes a thin wrapper:

```tsx
import { TrainScreen } from '../../src/features/train/TrainScreen';

export default function TrainTab() {
  return <TrainScreen />;
}
```

- [ ] **Step 2: Verify on both platforms**

Confirm: routine cards show counts, muscles and a last-trained line; adding an exercise in the builder updates the count on return (the `useFocusEffect` path); the empty state shows with no routines; scroll position survives a refresh.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/train apps/mobile/app/\(tabs\)/index.tsx
git commit -m "feat(train): rebuild the Train tab on routine summaries"
```

---

### Task 12: History tab and workout detail

**Files:** Modify `apps/mobile/src/features/history/HistoryList.tsx`, `apps/mobile/src/features/history/WorkoutDetailView.tsx`, `apps/mobile/app/(tabs)/history.tsx`

- [ ] **Step 1: Restyle**

`HistoryList`: `display` title, rows as `Card`s with the workout name as `heading`, and a `caption` metadata line keeping the existing date · sets · volume summary. Volume must keep routing through `formatWeight` — it is display-only and unit-aware.

`WorkoutDetailView`: `display` title, one `Card` per exercise, per-set lines as `numeric`. Keep `formatTrackedSet` for the per-set line; it is already tracking-type aware (7f15faa).

Add `EmptyState` to `HistoryList`: "No workouts yet", "Finish a workout and it will appear here."

- [ ] **Step 2: Verify on both platforms**

The summary and the detail must still agree — that agreement was a fixed defect, and the two reads are separate queries.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/history apps/mobile/app/\(tabs\)/history.tsx
git commit -m "feat(history): restyle the history list and detail"
```

---

### Task 13: Progress tab

**Files:** Modify `apps/mobile/src/features/records/RecordsList.tsx`, `apps/mobile/app/(tabs)/progress.tsx`

- [ ] **Step 1: Restyle**

`display` title "Progress", one `Card` per exercise, and the four metrics as a row of `StatTile`s (max weight, est. 1RM, max volume, max reps). Values keep going through `formatWeight`; max reps stays unitless.

`EmptyState`: "No records yet", "Log a set and your personal records will show up here."

**The Progress tab contains records and nothing else in this project.** Charts are deferred; do not add one.

- [ ] **Step 2: Verify on both platforms**

Check a `duration` exercise renders no weight-based metric, and that record dates still show the earliest-wins date rather than the latest.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/records apps/mobile/app/\(tabs\)/progress.tsx
git commit -m "feat(progress): restyle the records tab with stat tiles"
```

---

### Task 14: Profile tab

**Files:** Modify `apps/mobile/src/features/settings/SettingsScreen.tsx`, `apps/mobile/app/(tabs)/profile.tsx`

- [ ] **Step 1: Restyle**

`display` title "Profile". A `SectionLabel` "Units" over the existing kg/lb segmented control rebuilt from `Button` (`primary` for the selected unit, `secondary` for the other). Keep the explanatory caption — "Weight is always stored in kilograms. This only changes how it is displayed." — it states a real invariant.

Add a `SectionLabel` "About" with app name and version read from `expo-constants`.

Leave room below for Project B; do not add an account row or a sign-in affordance. A fake door is worse than an absence.

- [ ] **Step 2: Verify on both platforms**

Switch to lb, navigate to Progress and History, confirm converted values and that reps stay unitless. Switch back to kg.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/settings apps/mobile/app/\(tabs\)/profile.tsx
git commit -m "feat(profile): restyle settings as the Profile tab"
```

---

### Task 15: Exercise library and routine builder

**Files:** Modify `apps/mobile/src/features/library/ExerciseList.tsx`, `apps/mobile/src/ui/SearchField.tsx`, `apps/mobile/src/features/routines/RoutineBuilder.tsx`, `apps/mobile/src/features/routines/RoutineList.tsx`

- [ ] **Step 1: Restyle the library**

`SearchField` against the tokens (`surfaceRaised` background, `radius.md`, muted placeholder). Rows via `ListRow` with the exercise name as title and `` `${primaryMuscle} · ${equipment}` `` as subtitle. `EmptyState` for a search with no matches: "No exercises match", "Try a different name or equipment."

With 743 rows, confirm the list is still a `FlatList` (or convert it) — a `ScrollView` of 743 rows will stutter on Android.

- [ ] **Step 2: Restyle the builder**

Cards per exercise, `Text` variants throughout, `Button` for Move up/Move down. **Preserve the tracking-type behaviour from 7bfb4b9 exactly**: `targetInputsFor` supplies the inputs, `formatRoutineTarget` the set line, and a `duration` exercise gets no target box and a bare `Set N` line. Do not reintroduce a weight box for every exercise.

Replace the builder's inline stranded-workout `Modal` with `<Sheet>` from Task 4 —
the same dialog now exists on Train, and two copies will drift. The buttons,
their order and the body copy stay exactly as they are; only the container
changes. It remains a `Modal` underneath, never an `Alert`.

- [ ] **Step 3: Verify on both platforms**

Library search filters and scrolls smoothly; a duration exercise in the builder still shows no target inputs; reorder still works.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/features/library apps/mobile/src/features/routines apps/mobile/src/ui/SearchField.tsx
git commit -m "feat(ui): restyle the exercise library and routine builder"
```

---

### Task 16: Active session screen

**Files:** Modify `apps/mobile/src/features/session/ActiveSession.tsx`, `ExerciseCard.tsx`, `SetRow.tsx`, `RestTimer.tsx`

The highest-risk screen in the app: it holds the keyboard behaviour, the rest timer and the set inputs, each of which has already produced a defect.

- [ ] **Step 1: Restyle, preserving behaviour**

Apply the kit, and preserve **all** of the following exactly:

- `automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}` on the `ScrollView`, and **no** `behavior` on the `KeyboardAvoidingView` — together they apply the keyboard height twice (4784131).
- `keyboardShouldPersistTaps="handled"` — without it the first tap after typing is swallowed instead of hitting the checkmark.
- `setRest(null)` and `cancelRestNotification()` in the Finish handler (33ed6a4).
- `router.dismissAll()` then `router.replace('/')` on finish.
- Inputs locking once a set is completed (R22).
- `inputsFor(trackingType)` driving which boxes render.
- The rest timer pinned as a flex sibling of the `ScrollView`, not inside it.

Set inputs become `<NumericField>` from Task 4, which already carries the tabular
figures, the 48pt floor and the locked styling. `SetRow` keeps deciding *which*
fields to render via `inputsFor(trackingType)`; `NumericField` only renders one.
The completed-set checkmark uses `theme.colors.success` and keeps a 48×48 target.

- [ ] **Step 2: Verify on both platforms — full loop**

Log three sets → dismiss the keyboard → tap the lowest set row and confirm it scrolls above the keyboard → see the rest timer pinned → background the app for the full rest and confirm the notification fires **with sound** → finish → confirm no notification arrives afterwards → force-quit mid-workout and confirm resume restores the sets.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/session
git commit -m "feat(session): restyle the active session screen"
```

---

### Task 17: Full device pass and documentation

- [ ] **Step 1: Run the whole pipeline**

```bash
pnpm run ci
```

- [ ] **Step 2: Work the device checklist on both platforms**

Work `docs/superpowers/2026-09-20-device-verification.md` end to end on iOS **and** Android. Every screen has changed; treat every previously verified item as unverified.

- [ ] **Step 3: Update the docs**

- Rewrite the status section of `2026-09-20-device-verification.md` for the tabbed app, recording iOS and Android separately.
- Update `CLAUDE.md`: the `app/` layout now has a `(tabs)` group; the session route lives outside it; `packages/domain` has three new helpers; the design system lives in `src/ui/`.
- Write `docs/superpowers/2026-09-21-session-handoff.md` covering what was built, what is verified on which platform, and what Project B inherits.

- [ ] **Step 4: Commit**

```bash
git add -A docs CLAUDE.md
git commit -m "docs: record the app shell and design system, verified on both platforms"
```

---

## Deliberately not in this plan

- **Accounts, authentication, backend, sync** — Project B, its own spec.
- **Charts** — deferred; the Progress tab holds records only.
- **A light theme** — D4. Tokens are shaped so it is additive later.
- **Schema changes** — no migrations. `routine_sets` still has no target duration or distance column, so a plank can be planned but not given a target.
- **The tombstone semantic** — deleting an exercise still reports past workouts as "0 sets · 0 kg". Recorded in the handoff; a decision phase-2 sync inherits, not one to smuggle into a redesign.
