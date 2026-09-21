import { Text } from './Text';

export function SectionLabel({ children }: { children: string }) {
  return <Text variant="label" color="textMuted">{children}</Text>;
}
