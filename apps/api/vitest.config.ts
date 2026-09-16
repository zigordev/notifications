import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Vitest, not Jest — one runner across the estate.
 *
 * SWC rather than Vitest's default esbuild transform: esbuild does not
 * implement `emitDecoratorMetadata`, which NestJS dependency injection needs.
 *
 * The explicit file list is carried over from the Jest config unchanged. It is
 * deliberately narrow — the list names the modules that are actually unit-tested,
 * so the percentages mean something rather than being diluted by files nobody
 * tests. The thresholds sit at what that list reaches today.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: '../coverage',
      include: [
        'src/common/errors.ts',
        'src/config/app-config.ts',
        'src/email/email-sender.service.ts',
        'src/health/health.service.ts',
        'src/kafka/retry-executor.ts',
        'src/metrics/notification-metrics.service.ts',
        'src/notifications/notification-event.ts',
        'src/notifications/notification-processor.service.ts',
        'src/templates/template-catalog.service.ts',
      ],
      thresholds: {
        branches: 82,
        functions: 92,
        lines: 91,
        statements: 91,
      },
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
