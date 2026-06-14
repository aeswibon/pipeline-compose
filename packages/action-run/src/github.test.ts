import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GitHubActionsClient,
  matchesDispatchedRun,
  stripRefPrefix,
  artifactNameForStage,
} from './github.js';
import type { WorkflowRun } from './github.js';

describe('stripRefPrefix', () => {
  it('strips refs/heads and refs/tags', () => {
    expect(stripRefPrefix('refs/heads/master')).toBe('master');
    expect(stripRefPrefix('refs/tags/v1.0.0')).toBe('v1.0.0');
  });
});

describe('matchesDispatchedRun', () => {
  const baseRun: WorkflowRun = {
    id: 1,
    status: 'completed',
    conclusion: 'success',
    created_at: new Date('2026-06-14T12:00:00Z').toISOString(),
    head_branch: 'master',
  };

  it('matches branch dispatches by head_branch', () => {
    expect(
      matchesDispatchedRun(
        baseRun,
        'refs/heads/master',
        Date.parse('2026-06-14T11:59:50Z'),
      ),
    ).toBe(true);
  });

  it('matches tag dispatches when head_branch is null', () => {
    expect(
      matchesDispatchedRun(
        { ...baseRun, head_branch: null },
        'refs/tags/v1.0.0',
        Date.parse('2026-06-14T11:59:50Z'),
      ),
    ).toBe(true);
  });

  it('rejects runs created before dispatch window', () => {
    expect(
      matchesDispatchedRun(
        baseRun,
        'refs/heads/master',
        Date.parse('2026-06-14T12:00:10Z'),
      ),
    ).toBe(false);
  });
});

describe('GitHubActionsClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads workflow by path', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workflows: [{ id: 42, path: '.github/workflows/ci.yml', name: 'CI' }],
        }),
        { status: 200 },
      ),
    );

    const client = new GitHubActionsClient('token', 'owner', 'repo');
    const workflow = await client.getWorkflowByPath('.github/workflows/ci.yml');

    expect(workflow.id).toBe(42);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      '/repos/owner/repo/actions/workflows',
    );
  });

  it('dispatches workflow with stripped ref', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    const client = new GitHubActionsClient('token', 'owner', 'repo');
    await client.dispatchWorkflow(7, 'refs/tags/v1.0.0', { version: '1.0.0' });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      ref: 'v1.0.0',
      inputs: { version: '1.0.0' },
    });
  });

  it('withRepo scopes API calls to another repository', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workflows: [{ id: 9, path: '.github/workflows/remote.yml', name: 'Remote' }],
        }),
        { status: 200 },
      ),
    );

    const client = new GitHubActionsClient('token', 'owner', 'repo');
    const remote = client.withRepo('other-org', 'other-repo');
    await remote.getWorkflowByPath('.github/workflows/remote.yml');

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      '/repos/other-org/other-repo/actions/workflows',
    );
  });

  it('throws when workflow path is missing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ workflows: [] }), { status: 200 }),
    );

    const client = new GitHubActionsClient('token', 'owner', 'repo');
    await expect(client.getWorkflowByPath('.github/workflows/missing.yml')).rejects.toThrow(
      /Workflow not found/,
    );
  });

  it('surfaces API errors from request()', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('bad request', { status: 400 }),
    );

    const client = new GitHubActionsClient('token', 'owner', 'repo');
    await expect(client.getWorkflowByPath('.github/workflows/ci.yml')).rejects.toThrow(
      /GitHub API GET .* failed \(400\)/,
    );
  });

  it('waitForRun resolves the first matching dispatch', async () => {
    vi.useFakeTimers();
    const createdAt = new Date('2026-06-14T12:00:00Z').toISOString();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          workflow_runs: [
            {
              id: 55,
              status: 'queued',
              conclusion: null,
              created_at: createdAt,
              head_branch: 'master',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const client = new GitHubActionsClient('token', 'owner', 'repo');
    const promise = client.waitForRun(
      1,
      'refs/heads/master',
      Date.parse('2026-06-14T11:59:50Z'),
      5000,
      1000,
    );
    await vi.runAllTimersAsync();
    const run = await promise;
    expect(run.id).toBe(55);
    vi.useRealTimers();
  });

  it('waitForRunCompletion polls until status is completed', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 77,
            status: 'in_progress',
            conclusion: null,
            created_at: new Date().toISOString(),
            head_branch: 'master',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 77,
            status: 'completed',
            conclusion: 'success',
            created_at: new Date().toISOString(),
            head_branch: 'master',
          }),
          { status: 200 },
        ),
      );

    const client = new GitHubActionsClient('token', 'owner', 'repo');
    const promise = client.waitForRunCompletion(77, 5000, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    const run = await promise;
    expect(run.status).toBe('completed');
    vi.useRealTimers();
  });

  it('lists run jobs and artifacts', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobs: [{ id: 3, name: 'build' }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 3,
            name: 'build',
            status: 'completed',
            conclusion: 'success',
            outputs: { version: '1.0.0' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            artifacts: [{ id: 9, name: artifactNameForStage('ci') }],
          }),
          { status: 200 },
        ),
      );

    const client = new GitHubActionsClient('token', 'owner', 'repo');
    const jobs = await client.listRunJobs(10);
    expect(jobs[0].outputs).toEqual({ version: '1.0.0' });

    const artifacts = await client.listRunArtifacts(10);
    expect(artifacts[0].name).toBe('pipeline-compose-ci');
  });
});
