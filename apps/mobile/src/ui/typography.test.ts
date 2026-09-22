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
