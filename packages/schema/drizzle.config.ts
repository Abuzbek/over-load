import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'expo',
});
