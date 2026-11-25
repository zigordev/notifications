import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'notifications-events',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
