import { describe, expect, it } from 'vitest';
import { stagesFromMonorepoTaskGraph } from './monorepo-tasks.js';
import { renderImportedPipelineYaml } from './render-import.js';

describe('renderImportedPipelineYaml', () => {
  it('emits v2 pipeline yaml', () => {
    const stages = stagesFromMonorepoTaskGraph({
      build: {},
      test: { dependsOn: ['build'] },
    });
    const yaml = renderImportedPipelineYaml('ci', stages);
    expect(yaml).toContain('version: 2');
    expect(yaml).toContain('ci:');
    expect(yaml).toContain('id: test');
    expect(yaml).toContain('needs:');
  });
});
