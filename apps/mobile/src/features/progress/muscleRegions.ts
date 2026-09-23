import anatomy from '../../../../../tools/anatomy/regions.json';

/**
 * Maps the anatomy artwork's named regions onto this app's 17 catalogue
 * muscles. Many-to-one: the art splits pecs into upper/mid/lower and quads into
 * three heads, while an exercise only ever claims "chest" or "quadriceps".
 *
 * Artwork is from Vecteezy under its free licence, which permits commercial use
 * with attribution — see ATTRIBUTION below, which the Progress screen renders.
 * Converted from SVG by tools/anatomy/build.py.
 */
const MUSCLE_BY_REGION: Record<string, string> = {
  // Front
  'front-deltoid-left': 'shoulders',
  'front-deltoid-right': 'shoulders',
  'front-biceps': 'biceps',
  'front-triceps': 'triceps',
  'front-triceps-2': 'triceps',
  'front-forearm-left': 'forearms',
  'front-forearm-right': 'forearms',
  'front-trapezius': 'traps',
  'front-neck': 'neck',
  'front-pec-upper-left': 'chest',
  'front-pec-upper-right': 'chest',
  'front-pec-mid': 'chest',
  'front-pec-lower': 'chest',
  'front-abs': 'abdominals',
  'front-obliques': 'abdominals',
  'front-obliques-2': 'abdominals',
  'front-serratus': 'abdominals',
  // The tensor fasciae latae is a hip abductor, which is why it is not a quad.
  'front-tensor-fasciae-latae': 'abductors',
  'front-quad-center': 'quadriceps',
  'front-quad-outer': 'quadriceps',
  'front-quad-inner': 'quadriceps',
  'front-tibialis-left': 'calves',
  'front-tibialis-right': 'calves',

  // Back
  'back-rear-delt-left': 'shoulders',
  'back-rear-delt-right': 'shoulders',
  'back-triceps-left': 'triceps',
  'back-triceps-right': 'triceps',
  'back-forearm': 'forearms',
  'back-forearm-right': 'forearms',
  'back-trapezius': 'traps',
  'back-upper-back': 'middle back',
  'back-mid-back': 'lats',
  'back-lower-back': 'lower back',
  'back-glutes': 'glutes',
  'back-glutes-2': 'glutes',
  'back-glutes-right': 'glutes',
  'back-hamstrings-left': 'hamstrings',
  'back-hamstrings-right': 'hamstrings',
  'back-calves-left': 'calves',
  'back-calves-right': 'calves',
};

/**
 * Catalogue muscles this artwork has no region for. The art draws no adductor
 * group — the inner thigh it does draw is named quad-inner, the vastus
 * medialis, and colouring that for an adductor exercise would be a lie.
 * Listed rather than ignored so the gap is visible and tested.
 */
export const UNDRAWN_MUSCLES = ['adductors'];

export const ATTRIBUTION = 'Anatomy artwork via Vecteezy';

export type Region = {
  id: string;
  view: 'FRONT' | 'BACK';
  paths: string[];
  backdrop: boolean;
  muscle: string | null;
};

/**
 * One box per view, tightened by tools/anatomy/build.py to the figure's real
 * extent — the source canvas is a square with the body in a thin strip down the
 * middle, which renders as a postage stamp if used as-is.
 */
export const VIEW_BOXES: Record<'FRONT' | 'BACK', string> = anatomy.viewBoxes;

/** width / height of a view's box, for sizing the SVG without distortion. */
export function aspectRatio(view: 'FRONT' | 'BACK'): number {
  const [, , width, height] = VIEW_BOXES[view].split(' ').map(Number);
  return width! / height!;
}

export const REGIONS: Region[] = anatomy.regions.map((region) => ({
  id: region.id,
  view: region.view as 'FRONT' | 'BACK',
  paths: region.paths,
  backdrop: region.backdrop,
  muscle: MUSCLE_BY_REGION[region.id] ?? null,
}));

export const MAPPED_MUSCLES = new Set(Object.values(MUSCLE_BY_REGION));
