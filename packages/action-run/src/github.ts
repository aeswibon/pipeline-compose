import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type WorkflowSummary = {
  id: number;
  path: string;
  name: string;
};

export type WorkflowRun = {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  head_branch: string | null;
  head_sha?: string | null;
  event?: string;
};

export function matchesDispatchedRun(
  candidate: WorkflowRun,
  ref: string,
  notBeforeMs: number,
  clockSkewMs = 5000,
): boolean {
  const created = Date.parse(candidate.created_at);
  if (Number.isNaN(created) || created < notBeforeMs - clockSkewMs) {
    return false;
  }

  const refName = stripRefPrefix(ref);
  if (candidate.head_branch === refName) {
    return true;
  }

  // Tag dispatches often omit head_branch; accept recent runs for tag refs.
  if (ref.startsWith('refs/tags/') && candidate.head_branch == null) {
    return true;
  }

  return false;
}

export type WorkflowJob = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  outputs?: Record<string, string>;
};

export type WorkflowArtifact = {
  id: number;
  name: string;
};

export function artifactNameForStage(stageId: string): string {
  return `pipeline-compose-${stageId}`;
}

export class GitHubActionsClient {
  constructor(
    private readonly token: string,
    private readonly owner: string,
    private readonly repo: string,
    private readonly apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com',
  ) {}

  private async request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${body}`);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return (await res.json()) as T;
  }

  private async downloadBinary(path: string): Promise<Buffer> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API GET ${path} failed (${res.status}): ${body}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async getWorkflowByPath(workflowPath: string): Promise<WorkflowSummary> {
    const normalized = workflowPath.replace(/^\.\//, '');
    const data = await this.request<{ workflows: WorkflowSummary[] }>(
      `/repos/${this.owner}/${this.repo}/actions/workflows?per_page=100`,
    );
    const match = data.workflows.find(
      (w) => w.path === normalized || w.path.endsWith(`/${normalized}`),
    );
    if (!match) {
      throw new Error(`Workflow not found: ${workflowPath}`);
    }
    return match;
  }

  async dispatchWorkflow(
    workflowId: number,
    ref: string,
    inputs: Record<string, string>,
  ): Promise<void> {
    await this.request(`/repos/${this.owner}/${this.repo}/actions/workflows/${workflowId}/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: stripRefPrefix(ref), inputs }),
    });
  }

  async waitForRun(
    workflowId: number,
    ref: string,
    notBeforeMs: number,
    timeoutMs: number,
    pollMs: number,
  ): Promise<WorkflowRun> {
    const refName = stripRefPrefix(ref);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const data = await this.request<{ workflow_runs: WorkflowRun[] }>(
        `/repos/${this.owner}/${this.repo}/actions/workflows/${workflowId}/runs?event=workflow_dispatch&per_page=30`,
      );

      const run = data.workflow_runs.find((candidate) =>
        matchesDispatchedRun(candidate, ref, notBeforeMs),
      );

      if (run) {
        return run;
      }

      await sleep(pollMs);
    }

    throw new Error(`Timed out waiting for workflow run on ${refName}`);
  }

  async waitForRunCompletion(runId: number, timeoutMs: number, pollMs: number): Promise<WorkflowRun> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const run = await this.request<WorkflowRun>(
        `/repos/${this.owner}/${this.repo}/actions/runs/${runId}`,
      );
      if (run.status === 'completed') {
        return run;
      }
      await sleep(pollMs);
    }
    throw new Error(`Timed out waiting for workflow run ${runId}`);
  }

  async getJob(jobId: number): Promise<WorkflowJob> {
    return this.request<WorkflowJob>(`/repos/${this.owner}/${this.repo}/actions/jobs/${jobId}`);
  }

  async listRunJobs(runId: number): Promise<WorkflowJob[]> {
    const data = await this.request<{ jobs: WorkflowJob[] }>(
      `/repos/${this.owner}/${this.repo}/actions/runs/${runId}/jobs?per_page=100`,
    );
    return Promise.all(data.jobs.map((job) => this.getJob(job.id)));
  }

  async listRunArtifacts(runId: number): Promise<WorkflowArtifact[]> {
    const data = await this.request<{ artifacts: WorkflowArtifact[] }>(
      `/repos/${this.owner}/${this.repo}/actions/runs/${runId}/artifacts?per_page=100`,
    );
    return data.artifacts;
  }

  async downloadArtifactOutputs(artifactId: number): Promise<Record<string, string>> {
    const zipBytes = await this.downloadBinary(
      `/repos/${this.owner}/${this.repo}/actions/artifacts/${artifactId}/zip`,
    );
    const zipPath = join(tmpdir(), `pipeline-compose-artifact-${artifactId}.zip`);
    const extractDir = mkdtempSync(join(tmpdir(), 'pipeline-compose-artifact-'));
    writeFileSync(zipPath, zipBytes);
    try {
      execSync(`unzip -o -q ${JSON.stringify(zipPath)} -d ${JSON.stringify(extractDir)}`);
      const raw = readFileSync(join(extractDir, 'outputs.json'), 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, String(value)]),
      );
    } finally {
      rmSync(zipPath, { force: true });
      rmSync(extractDir, { recursive: true, force: true });
    }
  }

  async waitForStageArtifact(
    runId: number,
    stageId: string,
    timeoutMs: number,
    pollMs: number,
  ): Promise<Record<string, string>> {
    const name = artifactNameForStage(stageId);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const artifacts = await this.listRunArtifacts(runId);
      const match = artifacts.find((artifact) => artifact.name === name);
      if (match) {
        return this.downloadArtifactOutputs(match.id);
      }
      await sleep(pollMs);
    }

    throw new Error(`Timed out waiting for artifact ${name} on run ${runId}`);
  }

  withRepo(owner: string, repo: string): GitHubActionsClient {
    return new GitHubActionsClient(this.token, owner, repo, this.apiUrl);
  }
}

export function stripRefPrefix(ref: string): string {
  return ref.replace(/^refs\/heads\//, '').replace(/^refs\/tags\//, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
