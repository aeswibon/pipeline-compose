import { describe, it, expect } from 'vitest';
import { renderPipelineMermaid } from './mermaid.js';
import type { ResolvedPipeline } from './parser.js';

describe('renderPipelineMermaid', () => {
  it('renders nodes and needs edges', () => {
    const pipeline: ResolvedPipeline = {
      name: 'test',
      version: 1,
      stages: [
        { id: 'ci', workflow: '.github/workflows/ci.yml' },
        {
          id: 'deploy',
          workflow: '.github/workflows/deploy.yml',
          needs: ['ci'],
          repo: 'org/app',
        },
      ],
    };

    const diagram = renderPipelineMermaid(pipeline);
    expect(diagram).toContain('flowchart TD');
    expect(diagram).toContain('ci["ci"]');
    expect(diagram).toContain('deploy["deploy [org/app]"]');
    expect(diagram).toContain('ci --> deploy');
  });

  it('renders dotted fallback when no needs', () => {
    const pipeline: ResolvedPipeline = {
      name: 'flat',
      version: 1,
      stages: [
        { id: 'a', workflow: '.github/workflows/a.yml' },
        { id: 'b', workflow: '.github/workflows/b.yml' },
      ],
    };

    const diagram = renderPipelineMermaid(pipeline);
    expect(diagram).toContain('a -.-> b');
  });
});
