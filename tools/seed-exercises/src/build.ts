import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapSourceExercise, type SeedExercise, type SourceExercise } from './map';

const SOURCE_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

/**
 * The upstream set is ~870 entries including many near-duplicate machine
 * variations. We keep all equipment categories people actually log in commercial
 * gyms (barbell, dumbbell, cable, machine, kettlebells, etc.), which produces
 * ~740 exercises. Equipment category coverage matters more than an arbitrary
 * count cap — this ensures leg press, kettlebell work, machines, and other gym
 * mainstays are represented for the logger's exercise library.
 */
const KEEP_EQUIPMENT = new Set([
  'barbell', 'dumbbell', 'cable', 'machine', 'body only', 'kettlebells',
  'e-z curl bar', 'bands', 'medicine ball', 'exercise ball', 'none',
]);

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../curated.json');

async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Failed to fetch source: ${response.status}`);

  const source = (await response.json()) as SourceExercise[];

  const seen = new Set<string>();
  const curated: SeedExercise[] = [];

  for (const row of source) {
    if (!KEEP_EQUIPMENT.has(row.equipment ?? 'none')) continue;
    const key = row.name.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    curated.push(mapSourceExercise(row));
  }

  curated.sort((a, b) => a.name.localeCompare(b.name));

  await writeFile(OUT, `${JSON.stringify(curated, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${curated.length} exercises to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
