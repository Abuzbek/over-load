import bodyRegions from '../../../../../tools/body-muscles/regions.json';

/**
 * Maps this app's 17 primary muscles onto anatomical regions from
 * `body-muscles` (Apache-2.0, © 2024 Ivan Vulović), vendored as JSON by
 * tools/body-muscles/build.mjs.
 *
 * Vendored rather than imported: Metro resolves that package's exports map to
 * its ESM build, whose re-exports come back undefined in the React Native
 * bundle, and the app crashed on `Object.values(MUSCLE_MAP)` while the same
 * call worked under vitest. See the build script.
 *
 * That package has 89 regions and the exercise catalogue has 17 muscles, so
 * this is deliberately many-to-one. Regions with no entry here — head, hands,
 * feet, joints, serratus, hip flexors — are drawn in the base colour and never
 * light up, which is correct: no exercise in the catalogue claims them.
 */
const REGIONS_BY_MUSCLE: Record<string, string[]> = {
  chest: ['chest-upper', 'chest-lower'],
  shoulders: ['shoulder-front', 'shoulder-side', 'deltoid-rear'],
  biceps: ['biceps'],
  triceps: ['triceps-lateral', 'triceps-long'],
  forearms: ['forearm', 'forearm-extensors', 'forearm-flexors'],
  abdominals: ['abs-upper', 'abs-lower', 'obliques'],
  lats: ['lats-upper', 'lats-mid', 'lats-lower'],
  // The catalogue's "middle back" is the rhomboid/mid-trap region; "traps" is
  // the upper trap you shrug with. Splitting them keeps both usable.
  'middle back': ['traps-mid', 'traps-lower'],
  traps: ['traps-upper'],
  'lower back': ['lower-back-erectors', 'lower-back-ql', 'spine'],
  glutes: ['gluteus-maximus'],
  // Abduction is mostly gluteus medius, which is why it is not under glutes.
  abductors: ['gluteus-medius'],
  adductors: ['adductors'],
  quadriceps: ['quads'],
  hamstrings: ['hamstrings-lateral', 'hamstrings-medial'],
  calves: ['calves-gastroc-lateral', 'calves-gastroc-medial', 'calves-soleus', 'tibialis-anterior'],
  neck: ['neck', 'nape'],
};

export type Region = { id: string; path: string; view: 'FRONT' | 'BACK'; muscle: string | null };

const MUSCLE_BY_REGION = new Map<string, string>();
for (const [muscle, regions] of Object.entries(REGIONS_BY_MUSCLE)) {
  for (const region of regions) MUSCLE_BY_REGION.set(region, muscle);
}

export const REGIONS: Region[] = bodyRegions.regions.map((region) => ({
  id: region.id,
  path: region.path,
  view: region.view as 'FRONT' | 'BACK',
  muscle: MUSCLE_BY_REGION.get(region.id.replace(/-(left|right)$/, '')) ?? null,
}));

/** Every muscle the map can actually colour — the guard against a typo above. */
export const MAPPED_MUSCLES = new Set(Object.keys(REGIONS_BY_MUSCLE));
