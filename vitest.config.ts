import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'react-native': 'react-native-web',
    },
  },
  test: {
    environment: 'node',
    // Cloud Functions have their own runner (npm test in functions/).
    exclude: ['**/node_modules/**', 'functions/**'],
  },
});
