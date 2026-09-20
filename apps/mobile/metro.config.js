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
// @overload/schema exposes ./migrations and ./testing only via its package.json
// "exports" map. Metro's resolver ignores "exports" maps by default, so without
// this flag it cannot resolve those subpaths (e.g. `@overload/schema/migrations`
// in src/db/bootstrap.ts).
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
