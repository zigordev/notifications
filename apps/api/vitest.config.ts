import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Vitest, not Jest — one runner across the estate.
 *
 * SWC rather than Vitest's default esbuild transform: esbuild does not
 * implement `emitDecoratorMetadata`, which NestJS dependency injection needs.
 *
 * The coverage thresholds and the explicit file list are carried over from the
 * Jest config unchanged. They are deliberately narrow — the list names the
 * modules that are actually unit-tested, so the percentages mean something
 * rather than being diluted by files nobody tests.
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
        branches: 70,
        functions: 75,
        lines: 80,
        statements: 80,
      },
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
