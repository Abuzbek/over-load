import anatomy from '../../../../../tools/anatomy/regions.json';

/**
 * Maps the avatar artwork's region ids onto the catalogue's muscle groups.
 * One-to-one: the avatars and app_file.json name the same groups, the art in
 * camelCase and the file's featureMuscleGroup lookups in title case. Both figures use the
 * same ids, so one map serves both.
 *
 * Converted from SVG by tools/anatomy/build.py.
 */
const MUSCLE_BY_REGION: Record<string, string> = {
  frontDelts: 'Front Delts',
  sideDelts: 'Side Delts',
  rearDelts: 'Rear Delts',
  chest: 'Chest',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  neck: 'Neck',
  upperTraps: 'Upper Traps',
  upperBack: 'Upper Back',
  lats: 'Lats',
  lowerBack: 'Lower Back',
  abs: 'Abs',
  obliques: 'Obliques',
  serratus: 'Serratus',
  glutes: 'Glutes',
  abductors: 'Abductors',
  adductors: 'Adductors',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  tibs: 'Tibs',
};

/**
 * Catalogue muscles this artwork has no region for. The hip flexors sit deep
 * under the quads and the art does not draw them.
 * Listed rather than ignored so the gap is visible and tested.
 */
export const UNDRAWN_MUSCLES = ['Hip flexors'];

export type Figure = 'male' | 'female';
export type View = 'FRONT' | 'BACK';

export type Region = {
  id: string;
  figure: Figure;
  view: View;
  paths: string[];
  backdrop: boolean;
  muscle: string | null;
};

/** One box per figure and view, tightened by tools/anatomy/build.py. */
const VIEW_BOXES = anatomy.viewBoxes as Record<`${Figure}-${View}`, string>;

export function viewBox(figure: Figure, view: View): string {
  return VIEW_BOXES[`${figure}-${view}`];
}

/** width / height of a view's box, for sizing the SVG without distortion. */
export function aspectRatio(figure: Figure, view: View): number {
  const [, , width, height] = viewBox(figure, view).split(' ').map(Number);
  return width! / height!;
}

export const REGIONS: Region[] = anatomy.regions.map((region) => ({
  id: region.id,
  figure: region.figure as Figure,
  view: region.view as View,
  paths: region.paths,
  backdrop: region.backdrop,
  muscle: MUSCLE_BY_REGION[region.id] ?? null,
}));

export const MAPPED_MUSCLES = new Set(Object.values(MUSCLE_BY_REGION));
