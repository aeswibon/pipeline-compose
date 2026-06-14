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
      exclude: [
        '**/*.test.ts',
        'packages/action-*/src/index.ts',
        'packages/cli/src/main.ts',
      ],
      thresholds: {
        lines: 65,
        functions: 70,
        branches: 50,
        statements: 65,
      },
    },
  },
});
