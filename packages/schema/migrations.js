// Bridge so `@overload/schema/migrations` resolves under BOTH module systems.
//
// Node and Vitest honour the "exports" map in package.json, which points at
// ./drizzle/migrations.js directly. Metro's default resolver does NOT read
// "exports" — it uses classic node resolution, which looks for a file at
// <package>/migrations. Without this file, Metro cannot resolve the subpath.
//
// The obvious alternative — Metro's `unstable_enablePackageExports` — was tried
// and reverted: enabling it globally changed resolution across the whole
// dependency tree (1205 modules bundled instead of 1388) and silently broke
// expo-router's entry chain, so the app booted to "App entry not found".
// See apps/mobile/metro.config.js.
export { default } from './drizzle/migrations';
