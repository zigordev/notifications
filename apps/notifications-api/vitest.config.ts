import { configDefaults, defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'notifications-api',
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.db.test.ts'],
    testTimeout: 20_000,
  },
});
