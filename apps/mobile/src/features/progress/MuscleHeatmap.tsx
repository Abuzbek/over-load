import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { aspectRatio, type Figure, REGIONS, viewBox } from './muscleRegions';

function mix(from: string, to: string, t: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  const channel = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
  return `#${channel(r1!, r2!)}${channel(g1!, g2!)}${channel(b1!, b2!)}`;
}

/**
 * An untrained muscle has to be clearly visible against the card, or the body
 * reads as an empty silhouette and you cannot tell the shapes apart. Derived
 * from the theme rather than hard-coded so it follows a palette change.
 */
const UNTRAINED = mix(theme.colors.surface, theme.colors.textMuted, 0.22);
const OUTLINE = mix(theme.colors.surface, theme.colors.textMuted, 0.5);

/**
 * The faintest a worked muscle may be. Without a floor, one set out of a
 * twelve-set target is an 8% tint that is indistinguishable from untrained —
 * "I trained this a bit" and "I never touched this" must not look the same.
 */
const MIN_WORKED = 0.28;

type Props = {
  /** Sets per muscle, already windowed. */
  load: Map<string, number>;
  /** Sets that count as a fully trained muscle for this window. */
  target: number;
  /** Which body to draw — the profile's gender, male when unset. */
  figure: Figure;
};

/**
 * Front and back, coloured by how much each muscle has been worked.
 *
 * Intensity is measured against an absolute target, not against the busiest
 * muscle in the window. Scaling to the maximum would paint a single-set week
 * as fully trained, which is exactly the week you want to look empty.
 */
export function MuscleHeatmap({ load, target, figure }: Props) {
  const fillFor = (muscle: string | null) => {
    // Regions with no muscle — head, hands, feet, joints — stay flat.
    if (!muscle) return theme.colors.surfaceRaised;
    const sets = load.get(muscle) ?? 0;
    if (sets === 0) return UNTRAINED;
    const ratio = Math.min(sets / target, 1);
    return mix(UNTRAINED, theme.colors.accent, Math.max(ratio, MIN_WORKED));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {(['FRONT', 'BACK'] as const).map((view) => (
          <View key={view} style={styles.column}>
            <Svg viewBox={viewBox(figure, view)} style={[styles.body, { aspectRatio: aspectRatio(figure, view) }]}>
              {REGIONS.filter((r) => r.figure === figure && r.view === view).map((region, n) =>
                region.paths.map((d, i) => (
                  <Path
                    key={`${n}-${i}`}
                    d={d}
                    fill={region.backdrop ? theme.colors.surfaceRaised : fillFor(region.muscle)}
                    stroke={OUTLINE}
                    strokeWidth={4}
                  />
                )),
              )}
            </Svg>
            <Text variant="caption" color="textMuted">{view === 'FRONT' ? 'Front' : 'Back'}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.xl },
  column: { alignItems: 'center', gap: theme.spacing.xs },
  // Height drives the size; the view's own aspect ratio supplies the width, so
  // the two figures sit side by side instead of being two squares that do not
  // fit. Sizing by width instead made each body two and a half screens tall.
  body: { height: 320 },
});
