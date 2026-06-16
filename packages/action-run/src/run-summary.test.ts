import { describe, expect, it, vi } from 'vitest';
import { writePipelineRunSummary } from './run-summary.js';

vi.mock('@actions/core', () => ({
  summary: {
    addRaw: vi.fn(),
  },
}));

describe('writePipelineRunSummary', () => {
  it('writes smart rerun reuse line', async () => {
    const core = await import('@actions/core');
    writePipelineRunSummary('release', [
      { stageId: 'ci', runId: 1, outputs: {}, reused: true },
      { stageId: 'deploy', runId: 2, outputs: {} },
    ]);
    expect(core.summary.addRaw).toHaveBeenCalledWith(
      expect.stringContaining('reused **1** of **2**'),
    );
  });

  it('includes estimated CI time saved when durations are present', async () => {
    const core = await import('@actions/core');
    writePipelineRunSummary('release', [
      { stageId: 'ci', runId: 1, outputs: {}, reused: true, savedSeconds: 120 },
      { stageId: 'test', runId: 2, outputs: {}, reused: true, savedSeconds: 60 },
    ]);
    expect(core.summary.addRaw).toHaveBeenCalledWith(
      expect.stringContaining('Estimated CI time saved'),
    );
    expect(core.summary.addRaw).toHaveBeenCalledWith(
      expect.stringContaining('~3 minute(s)'),
    );
  });
});
