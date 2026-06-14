import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@aeswibon/pipeline-compose-core': path.resolve(
        root,
        'packages/core/src/index.ts',
      ),
    },
  },
  test: {
    include: ['packages/**/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['packages/**/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: {
        lines: 55,
        functions: 55,
        branches: 40,
        statements: 55,
      },
    },
  },
});
