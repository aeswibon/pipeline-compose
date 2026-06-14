import { describe, it, expect, vi } from 'vitest';
import type { Pipeline } from '@aeswibon/pipeline-compose-core';
import { runPipeline } from './orchestrator.js';
import type { GitHubActionsClient, WorkflowJob } from './github.js';

function mockClient(handlers: {
  workflows?: Record<string, number>;
}): GitHubActionsClient {
  const jobsByRun = new Map<number, WorkflowJob[]>();
  let nextRunId = 100;

  return {
    getWorkflowByPath: vi.fn(async (path: string) => {
      const id = handlers.workflows?.[path] ?? 1;
      return { id, path, name: path };
    }),
    dispatchWorkflow: vi.fn(async (workflowId, _ref, _inputs) => {
      const runId = nextRunId++;
      jobsByRun.set(runId, [
        {
          id: runId,
          name: 'stage',
          status: 'completed',
          conclusion: 'success',
          outputs:
            workflowId === 2
              ? { version: '1.0.0', skip_publish: 'false' }
              : {},
        },
      ]);
    }),
    waitForRun: vi.fn(async () => ({
      id: nextRunId - 1,
      status: 'in_progress',
      conclusion: null,
      created_at: new Date().toISOString(),
      head_branch: 'v1.0.0',
    })),
    waitForRunCompletion: vi.fn(async (runId) => ({
      id: runId,
      status: 'completed',
      conclusion: 'success',
      created_at: new Date().toISOString(),
      head_branch: 'v1.0.0',
    })),
    listRunJobs: vi.fn(async (runId) => jobsByRun.get(runId) ?? []),
  } as unknown as GitHubActionsClient;
}

describe('runPipeline', () => {
  const pipeline: Pipeline = {
    name: 'pipeline',
    version: 1,
    stages: [
      {
        id: 'ci',
        workflow: '.github/workflows/ci.yml',
      },
      {
        id: 'version-sync',
        workflow: '.github/workflows/stage-version-sync.yml',
        needs: ['ci'],
        outputs: ['version', 'skip_publish'],
      },
      {
        id: 'release-publish',
        workflow: '.github/workflows/stage-release-publish.yml',
        needs: ['version-sync'],
        inputs: {
          version: '${{ context.version-sync.version }}',
          skip_publish: '${{ context.version-sync.skip_publish }}',
        },
      },
    ],
  };

  it('runs stages in order and passes outputs as inputs', async () => {
    const client = mockClient({
      workflows: {
        '.github/workflows/ci.yml': 1,
        '.github/workflows/stage-version-sync.yml': 2,
        '.github/workflows/stage-release-publish.yml': 3,
      },
    });

    const results = await runPipeline(pipeline, client, {
      ref: 'refs/tags/v1.0.0',
      github: { ref: 'refs/tags/v1.0.0' },
    });

    expect(results).toHaveLength(3);
    expect(client.dispatchWorkflow).toHaveBeenCalledTimes(3);
    expect(client.dispatchWorkflow).toHaveBeenLastCalledWith(
      3,
      'refs/tags/v1.0.0',
      { version: '1.0.0', skip_publish: 'false' },
    );
  });

  it('skips stages when when expression is false', async () => {
    const pipelineWithWhen: Pipeline = {
      ...pipeline,
      stages: [
        {
          ...pipeline.stages[0],
          when: "startsWith(github.ref, 'refs/heads/')",
        },
      ],
    };
    const client = mockClient({});
    const results = await runPipeline(pipelineWithWhen, client, {
      ref: 'refs/tags/v1.0.0',
      github: { ref: 'refs/tags/v1.0.0' },
    });
    expect(results).toHaveLength(0);
    expect(client.dispatchWorkflow).not.toHaveBeenCalled();
  });
});
