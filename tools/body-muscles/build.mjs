/**
 * Extracts the anatomical region paths from the `body-muscles` package into a
 * plain JSON file we ship ourselves.
 *
 * Why vendor rather than import at runtime: the package's entry is an exports
 * map, and Metro resolves it to an ESM build whose re-exports come back
 * undefined in the React Native bundle — the app crashed on
 * `Object.values(MUSCLE_MAP)` while the same call worked under vitest. The data
 * is static, so the moving part is worth removing entirely. It also keeps their
 * React component and utils out of our bundle; we only need id, view and path.
 *
 * Source: https://github.com/vulovix/body-muscles (Apache-2.0, © 2024 Ivan Vulović)
 * Regenerate with: node tools/body-muscles/build.mjs
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Resolved from the app, which is where the dependency is declared.
const require = createRequire(new URL('../../apps/mobile/package.json', import.meta.url));
const { MUSCLE_MAP } = require('body-muscles');

const regions = Object.values(MUSCLE_MAP).map(({ id, view, path }) => ({ id, view, path }));
if (regions.length === 0) throw new Error('no regions found — did body-muscles change shape?');

writeFileSync(
  new URL('regions.json', import.meta.url),
  `${JSON.stringify({ source: 'body-muscles by Ivan Vulović, Apache-2.0', regions }, null, 2)}\n`,
);
console.log(`${regions.length} regions written`);
