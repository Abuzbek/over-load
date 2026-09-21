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
