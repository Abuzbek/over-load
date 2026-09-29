import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Rect } from 'react-native-svg';
import { theme } from './theme';

/** Width from layout, so a chart fills whatever card it sits in. */
function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  return [width, (e) => setWidth(Math.round(e.nativeEvent.layout.width))];
}

type LineProps = {
  /** The line, oldest first. */
  values: number[];
  /** Drawn as dots behind the line: the raw points a trend smooths. */
  dots?: number[];
  height?: number;
  color?: string;
  /** No axis line, no padding: a tile's sparkline. */
  bare?: boolean;
};

/** A line over evenly spaced points, scaled to its own range. */
export function LineChart({ values, dots, height = 120, color = theme.colors.accent, bare = false }: LineProps) {
  const [width, onLayout] = useWidth();
  const all = [...values, ...(dots ?? [])];
  const pad = bare ? 2 : 8;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const x = (i: number, n: number) => (n <= 1 ? width / 2 : pad + (i * (width - pad * 2)) / (n - 1));
  // A flat line (or one point) sits mid-height, not on the floor.
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2));
  const points = values.map((v, i) => `${x(i, values.length)},${y(v)}`).join(' ');
  return (
    <View style={{ height }} onLayout={onLayout}>
      {width > 0 && values.length > 0 ? (
        <Svg width={width} height={height}>
          {bare ? null : <Line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke={theme.colors.border} strokeWidth={1} />}
          {dots?.map((v, i) => <Circle key={i} cx={x(i, dots.length)} cy={y(v)} r={2.5} fill={theme.colors.textMuted} opacity={0.6} />)}
          {values.length === 1 ? (
            <Circle cx={x(0, 1)} cy={y(values[0]!)} r={3} fill={color} />
          ) : (
            <Polyline points={points} fill="none" stroke={color} strokeWidth={bare ? 2 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
          )}
        </Svg>
      ) : null}
    </View>
  );
}

type BarProps = {
  /** One bar per value, oldest first; a second number stacks on top in `stackColor`. */
  values: [number, number?][];
  height?: number;
  color?: string;
  stackColor?: string;
};

/** Bars from a zero baseline, scaled to the tallest. */
export function BarChart({ values, height = 120, color = theme.colors.accent, stackColor = '#6E9BFF' }: BarProps) {
  const [width, onLayout] = useWidth();
  const totals = values.map(([a, b = 0]) => a + b);
  const max = Math.max(...totals, 0) || 1;
  const gap = values.length > 26 ? 1 : 3;
  const barWidth = values.length > 0 ? Math.max((width - gap * (values.length - 1)) / values.length, 1) : 0;
  const h = (v: number) => (v / max) * (height - 2);
  return (
    <View style={{ height }} onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke={theme.colors.border} strokeWidth={1} />
          {values.map(([a, b = 0], i) => {
            const left = i * (barWidth + gap);
            return (
              <G key={i}>
                <Rect x={left} y={height - 1 - h(a)} width={barWidth} height={h(a)} fill={color} rx={2} />
                {b > 0 ? <Rect x={left} y={height - 1 - h(a) - h(b)} width={barWidth} height={h(b)} fill={stackColor} rx={2} /> : null}
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
