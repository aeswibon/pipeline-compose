import { describe, it, expect, vi } from 'vitest';
import { stageFingerprint, type Pipeline } from '@aeswibon/pipeline-compose-core';
import { runPipeline } from './orchestrator.js';
import * as githubModule from './github.js';
import * as smartRerunModule from './smart-rerun.js';
import type { GitHubActionsClient, WorkflowJob } from './github.js';

const runOptions = {
  ref: 'refs/tags/v1.0.0',
  github: { ref: 'refs/tags/v1.0.0' },
  defaultOwner: 'owner',
  defaultRepo: 'repo',
  githubToken: 'gh-default',
  repoTokens: {},
};

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
    getWorkflowRun: vi.fn(async (runId) => ({
      id: runId,
      status: 'completed',
      conclusion: 'success',
      created_at: new Date().toISOString(),
      run_started_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:02:00Z',
      head_branch: 'v1.0.0',
    })),
    listRunJobs: vi.fn(async (runId) => jobsByRun.get(runId) ?? []),
    waitForStageArtifact: vi.fn(async (_runId, stageId) => {
      if (stageId === 'artifact-stage') {
        return { version: '2.0.0' };
      }
      throw new Error(`unexpected artifact stage ${stageId}`);
    }),
    withRepo: vi.fn(function withRepo(this: GitHubActionsClient) {
      return this;
    }),
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

    const results = await runPipeline(pipeline, client, runOptions);

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
    const results = await runPipeline(pipelineWithWhen, client, runOptions);
    expect(results).toHaveLength(1);
    expect(results[0].skipped).toBe(true);
    expect(client.dispatchWorkflow).not.toHaveBeenCalled();
  });

  it('skips downstream stages when an upstream stage is skipped', async () => {
    const client = mockClient({
      workflows: {
        '.github/workflows/ci.yml': 1,
        '.github/workflows/stage-version-sync.yml': 2,
        '.github/workflows/stage-release-publish.yml': 3,
      },
    });

    const pipelineWithWhen: Pipeline = {
      ...pipeline,
      stages: [
        {
          ...pipeline.stages[0],
          when: "startsWith(github.ref, 'refs/heads/')",
        },
        pipeline.stages[1],
        pipeline.stages[2],
      ],
    };

    const results = await runPipeline(pipelineWithWhen, client, runOptions);

    expect(results).toHaveLength(3);
    expect(results.every((result) => result.skipped)).toBe(true);
    expect(client.dispatchWorkflow).not.toHaveBeenCalled();
  });

  it('collects outputs from stage artifacts when job outputs are missing', async () => {
    const pipelineWithArtifact: Pipeline = {
      name: 'pipeline',
      version: 1,
      stages: [
        {
          id: 'artifact-stage',
          workflow: '.github/workflows/artifact.yml',
          outputs: ['version'],
        },
      ],
    };
    const client = mockClient({
      workflows: { '.github/workflows/artifact.yml': 10 },
    });

    const results = await runPipeline(pipelineWithArtifact, client, {
      ...runOptions,
      ref: 'refs/tags/v2.0.0',
      github: { ref: 'refs/tags/v2.0.0' },
    });

    expect(results).toHaveLength(1);
    expect(results[0].outputs).toEqual({ version: '2.0.0' });
    expect(client.waitForStageArtifact).toHaveBeenCalledWith(
      expect.any(Number),
      'artifact-stage',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('throws when a stage completes with a non-success conclusion', async () => {
    const client = mockClient({
      workflows: { '.github/workflows/ci.yml': 1 },
    });
    vi.mocked(client.waitForRunCompletion).mockResolvedValueOnce({
      id: 100,
      status: 'completed',
      conclusion: 'failure',
      created_at: new Date().toISOString(),
      head_branch: 'v1.0.0',
    });

    await expect(
      runPipeline(
        {
          name: 'pipeline',
          version: 1,
          stages: [{ id: 'ci', workflow: '.github/workflows/ci.yml' }],
        },
        client,
        runOptions,
      ),
    ).rejects.toThrow(/Stage "ci" failed/);
  });

  it('uses scoped client with mapped token for cross-repo stage dispatch', async () => {
    const remoteClient = mockClient({
      workflows: { '.github/workflows/remote.yml': 99 },
    });
    const client = mockClient({
      workflows: { '.github/workflows/remote.yml': 99 },
    });
    const constructSpy = vi.spyOn(githubModule, 'GitHubActionsClient');
    constructSpy.mockImplementationOnce(function (token, owner, repo) {
      expect(token).toBe('remote-pat');
      expect(owner).toBe('other-org');
      expect(repo).toBe('other-repo');
      return remoteClient as unknown as GitHubActionsClient;
    });

    await runPipeline(
      {
        name: 'pipeline',
        version: 1,
        stages: [
          {
            id: 'remote',
            workflow: '.github/workflows/remote.yml',
            repo: 'other-org/other-repo',
          },
        ],
      },
      client,
      {
        ...runOptions,
        repoTokens: { 'other-org/other-repo': 'remote-pat' },
      },
    );

    expect(remoteClient.dispatchWorkflow).toHaveBeenCalled();
    expect(client.dispatchWorkflow).not.toHaveBeenCalled();
    constructSpy.mockRestore();
  });

  it('throws when cross-repo stage lacks repo_tokens_json entry', async () => {
    const client = mockClient({
      workflows: { '.github/workflows/remote.yml': 99 },
    });

    await expect(
      runPipeline(
        {
          name: 'pipeline',
          version: 1,
          stages: [
            {
              id: 'remote',
              workflow: '.github/workflows/remote.yml',
              repo: 'other-org/other-repo',
            },
          ],
        },
        client,
        runOptions,
      ),
    ).rejects.toThrow(/repo_tokens_json has no entry/);
  });

  it('uses github app token provider when repo_tokens_json has no entry', async () => {
    const remoteClient = mockClient({
      workflows: { '.github/workflows/remote.yml': 99 },
    });
    const client = mockClient({
      workflows: { '.github/workflows/remote.yml': 99 },
    });
    const constructSpy = vi.spyOn(githubModule, 'GitHubActionsClient');
    constructSpy.mockImplementationOnce(function (token, owner, repo) {
      expect(token).toBe('app-install-token');
      expect(owner).toBe('other-org');
      expect(repo).toBe('other-repo');
      return remoteClient as unknown as GitHubActionsClient;
    });
    const appTokenProvider = {
      tokenForRepo: vi.fn(async () => 'app-install-token'),
    };

    await runPipeline(
      {
        name: 'pipeline',
        version: 1,
        stages: [
          {
            id: 'remote',
            workflow: '.github/workflows/remote.yml',
            repo: 'other-org/other-repo',
          },
        ],
      },
      client,
      {
        ...runOptions,
        appTokenProvider: appTokenProvider as any,
      },
    );

    expect(appTokenProvider.tokenForRepo).toHaveBeenCalledWith('other-org', 'other-repo');
    expect(remoteClient.dispatchWorkflow).toHaveBeenCalled();
    constructSpy.mockRestore();
  });

  it('throws when required context from a skipped stage is missing', async () => {
    const client = mockClient({
      workflows: { '.github/workflows/publish.yml': 3 },
    });
    await expect(
      runPipeline(
        {
          name: 'pipeline',
          version: 1,
          stages: [
            {
              id: 'version-sync',
              workflow: '.github/workflows/stage-version-sync.yml',
              when: 'false',
            },
            {
              id: 'publish',
              workflow: '.github/workflows/publish.yml',
              inputs: {
                version: '${{ context.version-sync.version }}',
              },
            },
          ],
        },
        client,
        runOptions,
      ),
    ).rejects.toThrow(/requires context\.version-sync\.version/);
  });

  it('throws when declared outputs cannot be collected', async () => {
    const client = mockClient({
      workflows: { '.github/workflows/broken.yml': 5 },
    });
    vi.mocked(client.waitForStageArtifact).mockResolvedValueOnce({ other: 'value' });

    await expect(
      runPipeline(
        {
          name: 'pipeline',
          version: 1,
          stages: [
            {
              id: 'broken',
              workflow: '.github/workflows/broken.yml',
              outputs: ['version'],
            },
          ],
        },
        client,
        runOptions,
      ),
    ).rejects.toThrow(/Could not find outputs for stage "broken"/);
  });

  it('reuses cached cross-repo clients for repeated repo slugs', async () => {
    const remoteClient = mockClient({
      workflows: { '.github/workflows/remote-a.yml': 1, '.github/workflows/remote-b.yml': 2 },
    });
    const client = mockClient({
      workflows: { '.github/workflows/remote-a.yml': 1, '.github/workflows/remote-b.yml': 2 },
    });
    const constructSpy = vi.spyOn(githubModule, 'GitHubActionsClient');
    constructSpy.mockImplementation(function () {
      return remoteClient as unknown as GitHubActionsClient;
    });

    await runPipeline(
      {
        name: 'pipeline',
        version: 1,
        stages: [
          {
            id: 'a',
            workflow: '.github/workflows/remote-a.yml',
            repo: 'other-org/other-repo',
          },
          {
            id: 'b',
            workflow: '.github/workflows/remote-b.yml',
            repo: 'other-org/other-repo',
          },
        ],
      },
      client,
      {
        ...runOptions,
        repoTokens: { 'other-org/other-repo': 'remote-pat' },
      },
    );

    expect(constructSpy).toHaveBeenCalledTimes(1);
    constructSpy.mockRestore();
  });

  it('dispatches independent stages in the same wave concurrently', async () => {
    const dispatchOrder: string[] = [];
    let releaseResolve: (() => void) | undefined;
    const releaseGate = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });

    const client = mockClient({
      workflows: {
        '.github/workflows/ci.yml': 1,
        '.github/workflows/lint.yml': 2,
        '.github/workflows/test.yml': 3,
      },
    });

    vi.mocked(client.dispatchWorkflow).mockImplementation(async (workflowId) => {
      const paths: Record<number, string> = {
        1: '.github/workflows/ci.yml',
        2: '.github/workflows/lint.yml',
        3: '.github/workflows/test.yml',
      };
      const path = paths[workflowId] ?? String(workflowId);
      dispatchOrder.push(path);
      if (path.endsWith('lint.yml')) {
        await releaseGate;
      }
    });

    const parallelPipeline: Pipeline = {
      name: 'pipeline',
      version: 1,
      stages: [
        { id: 'ci', workflow: '.github/workflows/ci.yml' },
        { id: 'lint', workflow: '.github/workflows/lint.yml', needs: ['ci'] },
        { id: 'test', workflow: '.github/workflows/test.yml', needs: ['ci'] },
      ],
    };

    const runPromise = runPipeline(parallelPipeline, client, runOptions);
    await vi.waitFor(() => {
      expect(dispatchOrder).toContain('.github/workflows/lint.yml');
      expect(dispatchOrder).toContain('.github/workflows/test.yml');
    });
    releaseResolve?.();
    const results = await runPromise;

    expect(results).toHaveLength(3);
    expect(client.dispatchWorkflow).toHaveBeenCalledTimes(3);
    const lintIndex = dispatchOrder.indexOf('.github/workflows/lint.yml');
    const testIndex = dispatchOrder.indexOf('.github/workflows/test.yml');
    expect(lintIndex).toBeGreaterThanOrEqual(0);
    expect(testIndex).toBeGreaterThanOrEqual(0);
    expect(testIndex).toBeLessThan(lintIndex + 2);
  });

  it('reuses prior attempt outputs when smart_rerun is enabled', async () => {
    const stage = {
      id: 'ci',
      workflow: '.github/workflows/ci.yml',
    };
    const fingerprint = stageFingerprint(stage, {}, 'refs/tags/v1.0.0');
    const loadSpy = vi.spyOn(smartRerunModule, 'loadPreviousRerunState').mockResolvedValue({
      version: 1,
      stages: {
        ci: { fingerprint, outputs: { ok: 'true' }, runId: 42 },
      },
    });
    const persistSpy = vi.spyOn(smartRerunModule, 'persistRerunState').mockResolvedValue();

    const client = mockClient({
      workflows: { '.github/workflows/ci.yml': 1 },
    });

    const results = await runPipeline(
      {
        name: 'pipeline',
        version: 1,
        smart_rerun: true,
        stages: [stage],
      },
      client,
      { ...runOptions, smartRerun: true, runAttempt: 2, currentRunId: 999 },
    );

    expect(client.dispatchWorkflow).not.toHaveBeenCalled();
    expect(results[0]?.reused).toBe(true);
    expect(results[0]?.runId).toBe(42);
    expect(results[0]?.outputs).toEqual({ ok: 'true' });
    expect(results[0]?.savedSeconds).toBe(120);
    expect(persistSpy).toHaveBeenCalled();

    loadSpy.mockRestore();
    persistSpy.mockRestore();
  });
});
