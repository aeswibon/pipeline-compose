import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enforcePipelineConcurrency } from './concurrency-enforce.js';
import type { GitHubActionsClient, WorkflowRun } from './github.js';

function run(id: number, status: string, head_branch: string | null): WorkflowRun {
  return {
    id,
    status,
    conclusion: null,
    created_at: new Date().toISOString(),
    head_branch,
  };
}

describe('enforcePipelineConcurrency', () => {
  const client = {
    getWorkflowRun: vi.fn(),
    listWorkflowRuns: vi.fn(),
    cancelWorkflowRun: vi.fn(),
  } as unknown as GitHubActionsClient;

  beforeEach(() => {
    vi.mocked(client.getWorkflowRun).mockResolvedValue({
      id: 10,
      workflow_id: 99,
      status: 'in_progress',
      conclusion: null,
      created_at: new Date().toISOString(),
      head_branch: 'v1.0.0',
    });
    vi.mocked(client.listWorkflowRuns).mockResolvedValue([]);
    vi.mocked(client.cancelWorkflowRun).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns immediately when no conflicting runs exist', async () => {
    await enforcePipelineConcurrency(client, {
      currentRunId: 10,
      ref: 'refs/tags/v1.0.0',
      concurrency: { group: 'release-${{ github.ref }}' },
      github: { ref: 'refs/tags/v1.0.0' },
      pollMs: 1,
      timeoutMs: 100,
    });
    expect(client.cancelWorkflowRun).not.toHaveBeenCalled();
  });

  it('cancels other active runs on the same ref when cancel_in_progress is true', async () => {
    const active = [
      {
        ...run(5, 'in_progress', 'v1.0.0'),
        workflow_id: 99,
      },
    ];
    vi.mocked(client.listWorkflowRuns).mockImplementation(async (_id, opts) => {
      if (active.length === 0) {
        return [];
      }
      if (opts?.status === 'in_progress') {
        return [...active];
      }
      return [];
    });
    vi.mocked(client.cancelWorkflowRun).mockImplementation(async () => {
      active.length = 0;
    });

    await enforcePipelineConcurrency(client, {
      currentRunId: 10,
      ref: 'refs/tags/v1.0.0',
      concurrency: { group: 'release-${{ github.ref }}', cancel_in_progress: true },
      github: { ref: 'refs/tags/v1.0.0' },
      pollMs: 1,
      timeoutMs: 500,
    });

    expect(client.cancelWorkflowRun).toHaveBeenCalledWith(5);
  });
});
