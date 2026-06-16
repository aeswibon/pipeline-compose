import { describe, it, expect } from 'vitest';
import { generateWorkflow } from './codegen.js';
import type { Pipeline } from './parser.js';

describe('generateWorkflow', () => {
  it('emits runner workflow with compile-check and tag-gated stage jobs', () => {
    const pipeline: Pipeline = {
      name: 'pipeline',
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
    const yaml = generateWorkflow(pipeline, {
      pipelineFile: '.github/pipelines/pipeline.yml',
    });
    expect(yaml).toContain('compile-check:');
    expect(yaml).toContain('aeswibon/pipeline-compose-compile@v1.4.0');
    expect(yaml).toContain('output: .github/workflows/pipeline.yml');
    expect(yaml).toContain('sync:');
    expect(yaml).toContain('uses: ./.github/workflows/sync.yml');
    expect(yaml).toContain('build:');
    expect(yaml).toContain('needs:');
    expect(yaml).toContain('- sync');
    expect(yaml).toContain('secrets: inherit');
    expect(yaml).toContain('name: Pipeline');
    expect(yaml).toContain('needs.sync.outputs.version');
    expect(yaml).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(yaml).not.toContain('workflow_call');
  });

  it('adds bundle check step for local compile action', () => {
    const pipeline: Pipeline = {
      name: 'pipeline',
      version: 1,
      stages: [{ id: 'sync', workflow: '.github/workflows/sync.yml' }],
    };
    const yaml = generateWorkflow(pipeline, {
      pipelineFile: '.github/pipelines/pipeline.yml',
      compileAction: './packages/action-compile',
    });
    expect(yaml).toContain('packages/action-compile/dist/index.js');
    expect(yaml).toContain('uses: ./packages/action-compile');
  });

  it('combines tag gate with stage when expression', () => {
    const pipeline: Pipeline = {
      name: 'pipeline',
      version: 1,
      stages: [
        {
          id: 'sync',
          workflow: '.github/workflows/sync.yml',
          when: "github.ref == 'refs/heads/master'",
        },
      ],
    };
    const yaml = generateWorkflow(pipeline);
    expect(yaml).toContain(
      "startsWith(github.ref, 'refs/tags/v') && (github.ref == 'refs/heads/master')",
    );
  });
});
