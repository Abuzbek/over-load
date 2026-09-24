import { Lucide } from '@react-native-vector-icons/lucide';
import { Image, View } from 'react-native';
import { theme } from '../../ui/theme';
import { EQUIPMENT_IMAGES } from './equipmentImages';

/** An equipment item's drawing, or a dumbbell icon for the few without one. */
export function EquipmentThumb({ id, size }: { id: string; size: number }) {
  const source = EQUIPMENT_IMAGES[id];
  if (source) return <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Lucide name="dumbbell" size={size * 0.6} color={theme.colors.textMuted} />
    </View>
  );
}
