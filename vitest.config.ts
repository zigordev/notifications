import { defineConfig } from 'vitest/config';

const floor = 90;

export default defineConfig({
  test: {
    projects: [
      'apps/*/vitest.config.ts',
      'apps/*/vitest.db.config.ts',
      'packages/*/vitest.config.ts',
      'packages/*/vitest.db.config.ts',
      { test: { name: 'notifications', include: ['*.test.ts'] } },
    ],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{js,ts,tsx}', '**/*.d.ts', '**/src/generated/**'],
      reporter: ['text'],
      thresholds: { lines: floor, functions: floor, branches: floor, statements: floor },
    },
  },
});
