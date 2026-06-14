import { describe, it, expect } from 'vitest';
import { generateWorkflow } from './codegen.js';
import type { Pipeline } from './parser.js';

describe('generateWorkflow', () => {
  it('emits reusable workflow jobs with needs edges', () => {
    const pipeline: Pipeline = {
      name: 'release',
      version: 1,
      stages: [
        { id: 'sync', workflow: '.github/workflows/sync.yml', outputs: ['version'] },
        {
          id: 'build',
          workflow: '.github/workflows/build.yml',
          needs: ['sync'],
          inputs: { version: '${{ context.sync.version }}' },
          outputs: ['image_tag'],
        },
      ],
    };
    const yaml = generateWorkflow(pipeline);
    expect(yaml).toContain('sync:');
    expect(yaml).toContain('uses: ./.github/workflows/sync.yml');
    expect(yaml).toContain('build:');
    expect(yaml).toContain('needs:');
    expect(yaml).toContain('- sync');
    expect(yaml).toContain('secrets: inherit');
    expect(yaml).toContain('needs.sync.outputs.version');
  });
});
