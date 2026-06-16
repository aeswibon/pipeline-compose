import type { PipelineStage } from '@aeswibon/pipeline-compose-core';
import type { GitHubActionsClient } from './github.js';

export type CommitStatusMode = 'auto' | 'true' | 'false';

export type CommitStatusState = 'pending' | 'success' | 'failure' | 'error';

export function parseCommitStatusMode(raw: string): CommitStatusMode {
  const mode = raw.trim().toLowerCase();
  if (mode === 'true' || mode === 'false' || mode === 'auto') {
    return mode;
  }
  throw new Error(`commit_status must be auto, true, or false (got "${raw}")`);
}

export function shouldReportCommitStatus(mode: CommitStatusMode, eventName: string): boolean {
  if (mode === 'false') {
    return false;
  }
  if (mode === 'true') {
    return true;
  }
  return eventName === 'pull_request';
}

export function resolveCommitStatusSha(
  event: Record<string, unknown>,
  options: { explicitSha?: string; envSha?: string },
): string | null {
  if (options.explicitSha?.trim()) {
    return options.explicitSha.trim();
  }
  const pr = event.pull_request as { head?: { sha?: string } } | undefined;
  if (pr?.head?.sha) {
    return pr.head.sha;
  }
  if (options.envSha?.trim()) {
    return options.envSha.trim();
  }
  return null;
}

function stageContext(stage: PipelineStage): string {
  if (stage.repo) {
    return `pipeline-compose/${stage.repo}/${stage.id}`;
  }
  return `pipeline-compose/${stage.id}`;
}

function runTargetUrl(owner: string, repo: string, runId: number): string {
  const base = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  return `${base}/${owner}/${repo}/actions/runs/${runId}`;
}

export class CommitStatusReporter {
  constructor(
    private readonly client: GitHubActionsClient,
    private readonly sha: string,
    private readonly pipelineName: string,
  ) {}

  private async post(
    context: string,
    state: CommitStatusState,
    description: string,
    targetUrl?: string,
  ): Promise<void> {
    await this.client.createCommitStatus(this.sha, {
      context,
      state,
      description: description.slice(0, 140),
      target_url: targetUrl,
    });
  }

  async pipelinePending(): Promise<void> {
    await this.post(
      'pipeline-compose/pipeline',
      'pending',
      `Running pipeline "${this.pipelineName}"`,
    );
  }

  async pipelineComplete(success: boolean, summary: string): Promise<void> {
    await this.post(
      'pipeline-compose/pipeline',
      success ? 'success' : 'failure',
      summary,
    );
  }

  async stagePending(stage: PipelineStage): Promise<void> {
    const label = stage.repo ? `${stage.repo} stage` : 'stage';
    await this.post(stageContext(stage), 'pending', `Running ${label} "${stage.id}"`);
  }

  async stageSkipped(stage: PipelineStage, reason: string): Promise<void> {
    await this.post(stageContext(stage), 'success', `Skipped: ${reason}`);
  }

  async stageSuccess(
    stage: PipelineStage,
    owner: string,
    repo: string,
    runId: number,
    reused?: boolean,
  ): Promise<void> {
    const target = runId > 0 ? runTargetUrl(owner, repo, runId) : undefined;
    const description = reused
      ? `Reused outputs (smart rerun)`
      : stage.repo
        ? `Completed in ${owner}/${repo}`
        : 'Completed';
    await this.post(stageContext(stage), 'success', description, target);
  }

  async stageFailure(stage: PipelineStage, message: string): Promise<void> {
    await this.post(stageContext(stage), 'failure', message);
  }
}
