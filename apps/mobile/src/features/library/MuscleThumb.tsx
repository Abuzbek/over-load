import { Lucide } from '@react-native-vector-icons/lucide';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { theme } from '../../ui/theme';
import { muscleThumb } from './muscleThumbs';

type Props = { figure: 'male' | 'female'; muscle: string; size: number; selected?: boolean };

/** A muscle group on the body, highlighted. Hip flexors has no drawing: a placeholder. */
export function MuscleThumb({ figure, muscle, size, selected = false }: Props) {
  const xml = muscleThumb(figure, muscle);
  return (
    <View style={[styles.box, { width: size, height: size }, selected && styles.selected]}>
      {xml ? (
        <SvgXml xml={xml} width={size - 4} height={size - 4} />
      ) : (
        <Lucide name="person-standing" size={size / 2} color={theme.colors.textMuted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selected: { borderColor: theme.colors.accent },
});
