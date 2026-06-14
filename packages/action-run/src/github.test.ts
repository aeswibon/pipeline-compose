import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GitHubActionsClient,
  matchesDispatchedRun,
  stripRefPrefix,
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
});
