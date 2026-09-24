import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from './Text';
import { theme } from './theme';

type Props = {
  /** What has been done. Rendered large in the middle. */
  value: number;
  /** What it is measured against. Omit when there is nothing to measure against. */
  target?: number;
  size: number;
  color: string;
  /** Shown under the value, e.g. "4 left". Omitted when there is no target. */
  caption?: string;
};

/**
 * A donut arc. `target` omitted means "no comparison exists" and the track is
 * drawn plain — an arc with no denominator would either sit at 100% forever or
 * imply a goal the app has not got.
 */
export function ProgressRing({ value, target, size, color, caption }: Props) {
  const stroke = size > 100 ? 8 : 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = target && target > 0 ? Math.min(value / target, 1) : 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        {fraction > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            // Start the arc at twelve o'clock rather than three.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>

      <View style={styles.centre} pointerEvents="none">
        <Text variant="numeric" style={{ fontSize: size > 100 ? 30 : 22, lineHeight: size > 100 ? 36 : 28 }}>
          {value}
        </Text>
        {caption ? (
          <Text variant="caption" color="textMuted">
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
