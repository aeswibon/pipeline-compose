import { describe, it, expect } from 'vitest';
import { loadPipeline } from './parser.js';

describe('loadPipeline', () => {
  it('merges inline stages over file stages', () => {
    const file = `
name: release
version: 1
stages:
  - id: build
    workflow: .github/workflows/build.yml
`;
    const inline = `
stages:
  - id: deploy
    workflow: .github/workflows/deploy.yml
    needs: [build]
`;
    const result = loadPipeline({ fileYaml: file, inlineYaml: inline });
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0].id).toBe('deploy');
  });

  it('shallow-merges context keys', () => {
    const file = `
name: release
version: 1
context:
  ref: \${{ github.ref }}
stages:
  - id: a
    workflow: .github/workflows/a.yml
`;
    const inline = `
context:
  sha: \${{ github.sha }}
`;
    const result = loadPipeline({ fileYaml: file, inlineYaml: inline });
    expect(result.context).toEqual({
      ref: '${{ github.ref }}',
      sha: '${{ github.sha }}',
    });
  });
});
