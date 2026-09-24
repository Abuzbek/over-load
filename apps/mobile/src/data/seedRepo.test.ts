import {
  catalogueMeta,
  exerciseEquipment,
  exerciseLinks,
  exerciseMuscles,
  exercises,
  lookups,
  now,
} from '@overload/schema';
import { createTestDb } from '@overload/schema/testing';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import appFile from '../../assets/app_file.json';
import equipmentSeed from '../../../../tools/seed-equipment/equipment.json';
import { EQUIPMENT_SEED, fixtureExercise, fixtureFile } from './catalogueTestFixtures';
import { createCustomExercise, listExercises } from './exerciseRepo';
import {
  CATALOGUE_VERSION,
  getCatalogueVersion,
  inferTrackingType,
  syncCatalogue,
  type AppFile,
  type SeedEquipment,
} from './seedRepo';

let db: ReturnType<typeof createTestDb>['db'];
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestDb());
});

afterEach(() => close());

const exercise = (id: string) => db.select().from(exercises).where(eq(exercises.id, id)).get()!;
const links = (id: string, role: string) =>
  db.select().from(exerciseLinks)
    .where(and(eq(exerciseLinks.exerciseId, id), eq(exerciseLinks.role, role)))
    .orderBy(exerciseLinks.position).all().map((l) => l.lookupId);

describe('syncCatalogue', () => {
  beforeEach(() => syncCatalogue(db, fixtureFile(), EQUIPMENT_SEED, now()));

  it('keeps the file’s id and its single-valued fields as columns', () => {
    expect(exercise('Bench press')).toMatchObject({
      name: 'Bench press',
      trackingType: 'weight_reps',
      primaryMuscle: 'Chest',
      equipment: 'Barbell and weight plates',
      exerciseTypeId: 'compound',
      rom: 4,
      stability: 5,
      bodyweight: 0.076,
      isCustom: false,
    });
  });

  it('stores every list field as ordered links, by the file’s field name', () => {
    expect(links('Bench press', 'primaryFeatureMuscle')).toEqual(['chest', 'frontDelts']);
    expect(links('Bench press', 'movementPattern')).toEqual(['horizontalPush']);
    expect(links('Bench press', 'exerciseMetrics')).toEqual(['weight', 'reps']);
  });

  it('searches alternative names too', () => {
    expect(listExercises(db, { search: 'FLAT BENCH' }).map((e) => e.name)).toEqual(['Bench press']);
  });

  // Chest is listed as both primary and secondary: one set is one chest set.
  it('weighs muscles 1 primary / 0.5 secondary, the larger winning', () => {
    const rows = db.select().from(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, 'Bench press')).all();
    expect(Object.fromEntries(rows.map((r) => [r.muscleId, r.weight]))).toEqual({ chest: 1, frontDelts: 1, triceps: 0.5 });
  });

  it('flattens needs to owned items, dropping bodyweight', () => {
    const needs = (id: string) =>
      db.select().from(exerciseEquipment).where(eq(exerciseEquipment.exerciseId, id)).all()
        .map((r) => `${r.need}:${r.option}:${r.equipmentId}`).sort();
    expect(needs('Bench press')).toEqual(['resistance:0:barbell', 'resistance:0:plates', 'support:0:bench']);
    expect(needs('Dumbbell curl')).toEqual(['resistance:0:dumbbells']);
    expect(needs('Push-up')).toEqual([]);
  });

  it('records the version, so the next launch can skip the file', () => {
    expect(getCatalogueVersion(db)).toBe(CATALOGUE_VERSION);
  });

  it('is idempotent', () => {
    const count = () => db.select().from(exerciseLinks).all().length;
    const before = count();
    syncCatalogue(db, fixtureFile(), EQUIPMENT_SEED, now());
    expect(count()).toBe(before);
    expect(db.select().from(exercises).all()).toHaveLength(4);
  });

  // Sessions point at seeded exercises, so one the file drops must stay
  // readable by id — tombstoned, not deleted.
  it('tombstones an exercise the file drops, and revives it if it returns', () => {
    const file = fixtureFile();
    syncCatalogue(db, { ...file, exercises: file.exercises.filter((e) => e.id !== 'Leg press') }, EQUIPMENT_SEED, now());
    expect(exercise('Leg press').deletedAt).not.toBeNull();
    syncCatalogue(db, file, EQUIPMENT_SEED, now());
    expect(exercise('Leg press').deletedAt).toBeNull();
  });

  it('rebuilds a changed exercise’s links rather than appending', () => {
    const file = fixtureFile();
    const changed = file.exercises.map((e) =>
      e.id === 'Bench press' ? fixtureExercise('Bench press', { primaryFeatureMuscle: ['triceps'] }) : e,
    );
    syncCatalogue(db, { ...file, exercises: changed }, EQUIPMENT_SEED, now());
    expect(links('Bench press', 'primaryFeatureMuscle')).toEqual(['triceps']);
    expect(links('Bench press', 'movementPattern')).toEqual([]);
  });

  it('leaves a custom exercise and its muscle alone', () => {
    const custom = createCustomExercise(db, { name: 'Mine', trackingType: 'reps', primaryMuscle: 'quads', equipment: 'None' });
    syncCatalogue(db, fixtureFile(), EQUIPMENT_SEED, now());
    expect(exercise(custom.id).deletedAt).toBeNull();
    expect(db.select().from(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, custom.id)).all())
      .toEqual([{ exerciseId: custom.id, muscleId: 'quads', weight: 1 }]);
  });
});

describe('inferTrackingType', () => {
  it('maps the file’s metrics onto what the session screen logs', () => {
    expect(inferTrackingType(['Weight per side', 'Reps per side'])).toBe('weight_reps');
    expect(inferTrackingType(['Reps'])).toBe('reps');
    expect(inferTrackingType(['Duration per side', 'Weight'])).toBe('duration');
    expect(inferTrackingType(['Distance long', 'Duration'])).toBe('distance_duration');
    expect(inferTrackingType(['Distance short', 'Weight'])).toBe('weight_reps');
  });

  // More assistance is an easier set; a weight PR would reward it.
  it('does not treat assistance weight as load', () => {
    expect(inferTrackingType(['Assistance weight', 'Reps'])).toBe('reps');
  });
});

describe('the real app_file.json', () => {
  const file = appFile as unknown as AppFile;
  const seed = equipmentSeed.items as SeedEquipment[];

  // A new file with an old CATALOGUE_VERSION would never be seeded on
  // existing installs — launch would think it already was.
  it('is the file CATALOGUE_VERSION names', () => {
    expect(CATALOGUE_VERSION.split('#')[0]).toBe(file.generatedAt);
  });

  it('seeds every exercise, lookup and link, fast', () => {
    const started = performance.now();
    const result = syncCatalogue(db, file, seed, now());
    const elapsed = performance.now() - started;

    expect(result.exercises).toBe(1213);
    expect(db.select().from(exercises).where(isNull(exercises.deletedAt)).all()).toHaveLength(1213);
    expect(db.select().from(lookups).all()).toHaveLength(Object.keys(file.uuidIndex).length);
    expect(db.select().from(catalogueMeta).all()).toHaveLength(1);
    // Generous for CI; a laptop does this in well under a second.
    expect(elapsed).toBeLessThan(5000);
  });

  it('carries the fields that were lost before: body weight, rom, laterality', () => {
    syncCatalogue(db, file, seed, now());
    const press = listExercises(db, { search: '45° incline barbell press' })[0]!;
    expect(press).toMatchObject({ bodyweight: 0.076, rom: 4, stability: 5, primaryMuscle: 'Chest' });
    expect(links(press.id, 'laterality').map((id) => file.uuidIndex[id]!.name)).toEqual(['Bilateral']);
  });

  it('every need resolves to a catalogue item', () => {
    syncCatalogue(db, file, seed, now());
    const orphans = db.select().from(exerciseEquipment)
      .leftJoin(lookups, eq(lookups.id, exerciseEquipment.equipmentId))
      .where(isNull(lookups.id)).all();
    expect(orphans).toEqual([]);
  });
});
