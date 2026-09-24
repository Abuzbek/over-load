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
config.resolver.sourceExts.push('sql', 'svg');
// SVGs are inlined as strings by babel (see babel.config.js), never shipped as assets.
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');

// Package exports are on by default since SDK 57 (`unstable_enablePackageExports`).
// Under SDK 52 turning them on broke expo-router's entry ("App entry not found");
// if that screen ever returns, check how a dependency's `exports` map resolves.
module.exports = config;
