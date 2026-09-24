import type { AppFile, AppFileEntry, AppFileExercise, SeedEquipment } from './seedRepo';

/**
 * A miniature app_file.json: the shape syncCatalogue reads, with just enough
 * equipment to exercise the gym filter's rules — a group that needs two items,
 * a singular item a gym owns as its plural, and "Bodyweight only".
 */
export const INDEX: Record<string, AppFileEntry> = {
  'cat-bars': { type: 'appEquipmentCategory', name: 'Loadable Bars' },
  'cat-free': { type: 'appEquipmentCategory', name: 'Free Weights' },
  'cat-pin': { type: 'appEquipmentCategory', name: 'Pin Loaded Machines' },
  'cat-bench': { type: 'appEquipmentCategory', name: 'Benches & Racks' },
  'cat-other': { type: 'appEquipmentCategory', name: 'Other' },

  barbell: { type: 'equipment', name: 'Barbell', category: 'cat-bars', pluralOf: null },
  plates: { type: 'equipment', name: 'Weight plates', category: 'cat-free', pluralOf: null },
  dumbbell: { type: 'equipment', name: 'Dumbbell', category: 'cat-free', pluralOf: null },
  dumbbells: { type: 'equipment', name: 'Dumbbells', category: 'cat-free', pluralOf: 'dumbbell' },
  legPress: { type: 'equipment', name: 'Pin-loaded leg press', category: 'cat-pin', pluralOf: null },
  bench: { type: 'equipment', name: 'Flat bench', category: 'cat-bench', pluralOf: null },
  bodyweight: { type: 'equipment', name: 'Bodyweight only', category: null, pluralOf: null },

  barbellAndPlates: { type: 'resistanceEquipmentGroup', name: 'Barbell and weight plates', equipment: ['barbell', 'plates'] },

  chest: { type: 'featureMuscleGroup', name: 'Chest' },
  triceps: { type: 'featureMuscleGroup', name: 'Triceps' },
  frontDelts: { type: 'featureMuscleGroup', name: 'Front Delts' },
  quads: { type: 'featureMuscleGroup', name: 'Quads' },
  weight: { type: 'exerciseMetric', name: 'Weight' },
  reps: { type: 'exerciseMetric', name: 'Reps' },
  compound: { type: 'exerciseType', name: 'Multi-joint (compound)' },
  isolation: { type: 'exerciseType', name: 'Single joint (isolation)' },
  upperBody: { type: 'regionTrained', name: 'Upper body' },
  lowerBody: { type: 'regionTrained', name: 'Lower body' },
  bilateral: { type: 'laterality', name: 'Bilateral' },
  unilateral: { type: 'laterality', name: 'Unilateral' },
  horizontalPush: { type: 'movementPattern', name: 'Horizontal Push' },
  rom4: { type: 'rom', name: 4 },
  stab5: { type: 'stability', name: '5' },
  alt: { type: 'alternativeName', name: 'Flat bench' },
};

export function fixtureExercise(id: string, fields: Partial<AppFileExercise> = {}): AppFileExercise {
  return {
    id,
    name: id,
    exerciseType: 'compound',
    primaryFeatureMuscle: ['chest'],
    secondaryFeatureMuscle: [],
    exerciseMetrics: ['weight', 'reps'],
    resistanceEquipmentGroupIds: [],
    supportEquipmentGroupIds: [],
    ...fields,
  };
}

export const EXERCISES: AppFileExercise[] = [
  fixtureExercise('Bench press', {
    primaryFeatureMuscle: ['chest', 'frontDelts'],
    secondaryFeatureMuscle: ['triceps', 'chest'],
    movementPattern: ['horizontalPush'],
    alternativeName: ['alt'],
    rom: 'rom4',
    stability: 'stab5',
    bodyweight: 0.076,
    regionTrained: 'upperBody',
    laterality: ['bilateral'],
    resistanceEquipmentGroupIds: ['barbellAndPlates'],
    supportEquipmentGroupIds: ['bench'],
  }),
  fixtureExercise('Dumbbell curl', {
    exerciseType: 'isolation',
    regionTrained: 'upperBody',
    laterality: ['unilateral'],
    resistanceEquipmentGroupIds: ['dumbbell'],
  }),
  fixtureExercise('Push-up', { exerciseMetrics: ['reps'], resistanceEquipmentGroupIds: ['bodyweight'] }),
  fixtureExercise('Leg press', { primaryFeatureMuscle: ['quads'], regionTrained: 'lowerBody', resistanceEquipmentGroupIds: ['legPress'] }),
];

export function fixtureFile(overrides: Partial<AppFile> = {}): AppFile {
  return { generatedAt: 'test', exercises: EXERCISES, uuidIndex: INDEX, ...overrides };
}

/** equipment.json entries: the weights each item starts with, by name. */
export const EQUIPMENT_SEED: SeedEquipment[] = [
  { name: 'Barbell', category: 'loaded_bars', kind: 'list', values: [{ kg: 20 }] },
  { name: 'Weight Plates', category: 'free_weights', kind: 'list', values: [{ kg: 20 }] },
  { name: 'Dumbbells', category: 'free_weights', kind: 'list', values: [{ kg: 10 }, { kg: 20 }] },
  { name: 'Pin-Loaded Leg Press', category: 'pin_loaded_machines', kind: 'range', minKg: 0, maxKg: 250, incrementKg: 5 },
  { name: 'Flat Bench', category: 'benches_racks', kind: 'none' },
  { name: 'Bodyweight Only', category: 'other', kind: 'none' },
];

/** Items a gym can own: every equipment entry that is not another's singular. */
export const OWNABLE = ['Barbell', 'Weight plates', 'Dumbbells', 'Pin-loaded leg press', 'Flat bench', 'Bodyweight only'];
