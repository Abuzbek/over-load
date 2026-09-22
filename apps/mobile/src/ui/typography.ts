// apps/mobile/src/ui/typography.ts
import type { TextStyle } from 'react-native';

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
  // Typed against RN's own FontVariant union (rather than a bare `string[]`)
  // so every `...textStyle(...)` spread stays assignable to `TextStyle` at
  // call sites — a plain `string[]` here fails `pnpm typecheck` even for
  // variants that never set this field.
  fontVariant?: TextStyle['fontVariant'];
};

const BASE: Record<TextVariant, TextStyleObject> = {
  display: { fontSize: 25, lineHeight: 29, fontWeight: '600', letterSpacing: -0.5 },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '600', letterSpacing: -0.2 },
  heading: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 19, fontWeight: '400' },
  label: { fontSize: 11, lineHeight: 15, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase' },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '400' },
  numeric: { fontSize: 14, lineHeight: 19, fontWeight: '600', fontVariant: ['tabular-nums'] },
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
