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
};

export type WorkflowJob = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  outputs?: Record<string, string>;
};

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
        `/repos/${this.owner}/${this.repo}/actions/workflows/${workflowId}/runs?event=workflow_dispatch&per_page=10`,
      );

      const run = data.workflow_runs.find((candidate) => {
        const created = Date.parse(candidate.created_at);
        return created >= notBeforeMs - 5000 && candidate.head_branch === refName;
      });

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

  async listRunJobs(runId: number): Promise<WorkflowJob[]> {
    const data = await this.request<{ jobs: WorkflowJob[] }>(
      `/repos/${this.owner}/${this.repo}/actions/runs/${runId}/jobs?per_page=100`,
    );
    return data.jobs;
  }
}

export function stripRefPrefix(ref: string): string {
  return ref.replace(/^refs\/heads\//, '').replace(/^refs\/tags\//, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
