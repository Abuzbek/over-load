import { theme } from '../../ui/theme';
import male_abductors from '../../../assets/muscle_groups/male/abductors.svg';
import male_abs from '../../../assets/muscle_groups/male/abs.svg';
import male_adductors from '../../../assets/muscle_groups/male/adductors.svg';
import male_biceps from '../../../assets/muscle_groups/male/biceps.svg';
import male_calves from '../../../assets/muscle_groups/male/calves.svg';
import male_chest from '../../../assets/muscle_groups/male/chest.svg';
import male_forearms from '../../../assets/muscle_groups/male/forearms.svg';
import male_frontDelts from '../../../assets/muscle_groups/male/front_delts.svg';
import male_glutes from '../../../assets/muscle_groups/male/glutes.svg';
import male_hamstrings from '../../../assets/muscle_groups/male/hamstrings.svg';
import male_lats from '../../../assets/muscle_groups/male/lats.svg';
import male_lowerBack from '../../../assets/muscle_groups/male/lower_back.svg';
import male_neck from '../../../assets/muscle_groups/male/neck.svg';
import male_obliques from '../../../assets/muscle_groups/male/obliques.svg';
import male_quads from '../../../assets/muscle_groups/male/quads.svg';
import male_rearDelts from '../../../assets/muscle_groups/male/rear_delts.svg';
import male_serratus from '../../../assets/muscle_groups/male/serratus.svg';
import male_sideDelts from '../../../assets/muscle_groups/male/side_delts.svg';
import male_tibs from '../../../assets/muscle_groups/male/tibs.svg';
import male_triceps from '../../../assets/muscle_groups/male/triceps.svg';
import male_upperBack from '../../../assets/muscle_groups/male/upper_back.svg';
import male_upperTraps from '../../../assets/muscle_groups/male/upper_traps.svg';
import female_abductors from '../../../assets/muscle_groups/female/abductors.svg';
import female_abs from '../../../assets/muscle_groups/female/abs.svg';
import female_adductors from '../../../assets/muscle_groups/female/adductors.svg';
import female_biceps from '../../../assets/muscle_groups/female/biceps.svg';
import female_calves from '../../../assets/muscle_groups/female/calves.svg';
import female_chest from '../../../assets/muscle_groups/female/chest.svg';
import female_forearms from '../../../assets/muscle_groups/female/forearms.svg';
import female_frontDelts from '../../../assets/muscle_groups/female/front_delts.svg';
import female_glutes from '../../../assets/muscle_groups/female/glutes.svg';
import female_hamstrings from '../../../assets/muscle_groups/female/hamstrings.svg';
import female_lats from '../../../assets/muscle_groups/female/lats.svg';
import female_lowerBack from '../../../assets/muscle_groups/female/lower_back.svg';
import female_neck from '../../../assets/muscle_groups/female/neck.svg';
import female_obliques from '../../../assets/muscle_groups/female/obliques.svg';
import female_quads from '../../../assets/muscle_groups/female/quads.svg';
import female_rearDelts from '../../../assets/muscle_groups/female/rear_delts.svg';
import female_serratus from '../../../assets/muscle_groups/female/serratus.svg';
import female_sideDelts from '../../../assets/muscle_groups/female/side_delts.svg';
import female_tibs from '../../../assets/muscle_groups/female/tibs.svg';
import female_triceps from '../../../assets/muscle_groups/female/triceps.svg';
import female_upperBack from '../../../assets/muscle_groups/female/upper_back.svg';
import female_upperTraps from '../../../assets/muscle_groups/female/upper_traps.svg';

/**
 * One thumbnail per feature-muscle group, drawn for a light background: body
 * #EEEEEE, outline #DCDCDC, the muscle itself #276EF1. Recoloured once here
 * to the dark theme. Keyed by the group's lower-cased name; Hip flexors has none.
 */
function recolour(svg: string): string {
  return svg
    .replaceAll('#EEEEEE', theme.colors.border)
    .replaceAll('#DCDCDC', theme.colors.surfaceRaised)
    .replaceAll('#276EF1', theme.colors.accent);
}

const RAW = {
  male: {
    'abductors': male_abductors,
    'abs': male_abs,
    'adductors': male_adductors,
    'biceps': male_biceps,
    'calves': male_calves,
    'chest': male_chest,
    'forearms': male_forearms,
    'front delts': male_frontDelts,
    'glutes': male_glutes,
    'hamstrings': male_hamstrings,
    'lats': male_lats,
    'lower back': male_lowerBack,
    'neck': male_neck,
    'obliques': male_obliques,
    'quads': male_quads,
    'rear delts': male_rearDelts,
    'serratus': male_serratus,
    'side delts': male_sideDelts,
    'tibs': male_tibs,
    'triceps': male_triceps,
    'upper back': male_upperBack,
    'upper traps': male_upperTraps,
  },
  female: {
    'abductors': female_abductors,
    'abs': female_abs,
    'adductors': female_adductors,
    'biceps': female_biceps,
    'calves': female_calves,
    'chest': female_chest,
    'forearms': female_forearms,
    'front delts': female_frontDelts,
    'glutes': female_glutes,
    'hamstrings': female_hamstrings,
    'lats': female_lats,
    'lower back': female_lowerBack,
    'neck': female_neck,
    'obliques': female_obliques,
    'quads': female_quads,
    'rear delts': female_rearDelts,
    'serratus': female_serratus,
    'side delts': female_sideDelts,
    'tibs': female_tibs,
    'triceps': female_triceps,
    'upper back': female_upperBack,
    'upper traps': female_upperTraps,
  },
};

const cache = new Map<string, string>();

export function muscleThumb(figure: 'male' | 'female', muscle: string): string | undefined {
  const key = `${figure}:${muscle.toLowerCase()}`;
  if (!cache.has(key)) {
    const raw = (RAW[figure] as Record<string, string>)[muscle.toLowerCase()];
    if (!raw) return undefined;
    cache.set(key, recolour(raw));
  }
  return cache.get(key);
}
