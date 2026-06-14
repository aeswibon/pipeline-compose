import { describe, it, expect } from 'vitest';
import {
  buildValidateReport,
  formatPipelineTree,
  serializeValidateReport,
  workflowMatchesGroupConvention,
} from './validate-report.js';
import type { ResolvedPipeline } from './parser.js';

const samplePipeline: ResolvedPipeline = {
  name: 'release',
  version: 1,
  group: 'release',
  groups: {
    release: { description: 'Tag release chain' },
  },
  stages: [
    {
      id: 'ci',
      workflow: '.github/workflows/ci.yml',
      resolvedGroup: 'release',
    },
    {
      id: 'sync',
      workflow: '.github/workflows/stage-version-sync.yml',
      resolvedGroup: 'release',
      needs: ['ci'],
    },
  ],
};

describe('workflowMatchesGroupConvention', () => {
  it('accepts group prefix and stage prefix', () => {
    expect(workflowMatchesGroupConvention('.github/workflows/release-ci.yml', 'release')).toBe(
      true,
    );
    expect(
      workflowMatchesGroupConvention('.github/workflows/stage-version-sync.yml', 'release'),
    ).toBe(true);
    expect(workflowMatchesGroupConvention('.github/workflows/ci.yml', 'release', 'ci')).toBe(true);
  });

  it('warns on unrelated filenames', () => {
    expect(workflowMatchesGroupConvention('.github/workflows/ci.yml', 'release')).toBe(false);
  });
});

describe('formatPipelineTree', () => {
  it('prints grouped stages with descriptions', () => {
    const tree = formatPipelineTree(samplePipeline);
    expect(tree).toContain('Pipeline: release (2 stage(s))');
    expect(tree).toContain('[release] — Tag release chain');
    expect(tree).toContain('ci → .github/workflows/ci.yml');
  });
});

describe('buildValidateReport', () => {
  it('promotes warnings to errors in strict mode', () => {
    const report = buildValidateReport(samplePipeline, { strict: true });
    expect(report.issues.some((issue) => issue.code === 'group.path-prefix')).toBe(false);
    expect(report.issues.every((issue) => issue.level === 'error')).toBe(true);
  });

  it('warns for cross-repo stages and errors on invalid repo slug', () => {
    const report = buildValidateReport({
      ...samplePipeline,
      stages: [
        {
          id: 'remote',
          workflow: '.github/workflows/remote.yml',
          repo: 'other-org/other-repo',
        },
        {
          id: 'bad',
          workflow: '.github/workflows/bad.yml',
          repo: 'not-a-slug',
        },
      ],
    });

    expect(report.issues.some((issue) => issue.code === 'stage.cross-repo')).toBe(true);
    expect(report.issues.some((issue) => issue.code === 'stage.repo-invalid')).toBe(true);
  });
});

describe('serializeValidateReport', () => {
  it('returns machine-readable JSON with pipeline summary', () => {
    const report = buildValidateReport(samplePipeline);
    const json = JSON.parse(serializeValidateReport(report)) as {
      ok: boolean;
      pipeline: { name: string; stageCount: number };
      issues: unknown[];
    };
    expect(json.ok).toBe(true);
    expect(json.pipeline.name).toBe('release');
    expect(json.pipeline.stageCount).toBe(2);
    expect(Array.isArray(json.issues)).toBe(true);
  });
});
