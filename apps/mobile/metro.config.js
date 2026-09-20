const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.sourceExts.push('sql');

// NOTE: do NOT set `config.resolver.unstable_enablePackageExports = true` here.
// It was added once to resolve `@overload/schema/migrations` and it silently
// changed resolution across the entire dependency tree — Metro bundled 1205
// modules instead of 1388, picking different builds of several packages, and
// expo-router's entry chain stopped registering the "main" component. The app
// booted to a red "App entry not found" screen with no error in any log.
// The migrations subpath is handled by packages/schema/migrations.js instead.
module.exports = config;
