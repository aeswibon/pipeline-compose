import { describe, it, expect } from 'vitest';
import { renderPipelineMermaid } from './mermaid.js';
import type { ResolvedPipeline } from './parser.js';
import type { ValidationIssue } from './validate-report.js';

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

  it('marks error and blocked stages when issues are provided', () => {
    const pipeline: ResolvedPipeline = {
      name: 'release',
      version: 2,
      group: 'release',
      stages: [
        { id: 'ci', workflow: '.github/workflows/ci.yml' },
        {
          id: 'broken-gate',
          workflow: '.github/workflows/missing.yml',
          needs: ['ci'],
        },
        {
          id: 'version-sync',
          workflow: '.github/workflows/stage-version-sync.yml',
          needs: ['broken-gate'],
        },
      ],
    };

    const issues: ValidationIssue[] = [
      {
        level: 'error',
        code: 'workflow.missing',
        message:
          'Missing workflow file for stage "broken-gate": .github/workflows/missing.yml',
      },
      {
        level: 'error',
        code: 'group.path-prefix',
        message:
          'Stage "broken-gate" group "release" does not match workflow path .github/workflows/missing.yml',
      },
    ];

    const diagram = renderPipelineMermaid(pipeline, { issues });
    expect(diagram).toContain('broken_gate["broken-gate (release)<br/>❌ missing workflow file"]:::error');
    expect(diagram).toContain(
      'version_sync["version-sync (release)<br/>⚠ blocked upstream"]:::blocked',
    );
    expect(diagram).toContain('classDef error');
    expect(diagram).toContain('classDef blocked');
    expect(diagram).toContain('ci --> broken_gate');
    expect(diagram).toContain('broken_gate --> version_sync');
  });
});
