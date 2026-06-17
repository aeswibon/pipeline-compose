import type { Pipeline, PipelineStage } from '@aeswibon/pipeline-compose-core';
import {
  canReuseStage,
  collectSubPipelineOutputs,
  evaluateExpression,
  groupStagesIntoWaves,
  mergeContext,
  parseRepoSlug,
  resolveSubPipeline,
  stageFingerprint,
  type RerunState,
} from '@aeswibon/pipeline-compose-core';
import * as core from '@actions/core';
import { enforcePipelineConcurrency } from './concurrency-enforce.js';
import { type CommitStatusReporter } from './commit-status.js';
import { GitHubAppTokenProvider } from './github-app.js';
import { resolveStageInputs } from './inputs.js';
import { resolveStageToken, type RepoTokenMap } from './repo-tokens.js';
import { GitHubActionsClient, type WorkflowJob } from './github.js';
import {
  emptyRerunState,
  loadPreviousRerunState,
  persistRerunState,
} from './smart-rerun.js';
import { runDurationSeconds } from './run-duration.js';
import { workflowFileDigest, workflowRemoteDigest } from './workflow-digest.js';

export type OrchestratorOptions = {
  ref: string;
  github: Record<string, unknown>;
  defaultOwner: string;
  defaultRepo: string;
  githubToken: string;
  repoTokens: RepoTokenMap;
  appTokenProvider?: GitHubAppTokenProvider;
  /** Parent workflow run id (GITHUB_RUN_ID) for concurrency enforcement. */
  currentRunId?: number;
  /** Reuse prior attempt outputs when stage inputs are unchanged. */
  smartRerun?: boolean;
  /** GITHUB_RUN_ATTEMPT (1 on first run). */
  runAttempt?: number;
  repoRoot?: string;
  /** Inputs forwarded from a parent sub-pipeline stage. */
  subPipelineInputs?: Record<string, string>;
  /** Optional PR commit status reporter (entry repo). */
  commitStatus?: CommitStatusReporter;
  timeoutMs?: number;
  pollMs?: number;
};

export type StageResult = {
  stageId: string;
  runId: number;
  outputs: Record<string, string>;
  skipped?: boolean;
  reused?: boolean;
  /** Prior run duration when smart rerun skipped re-dispatch. */
  savedSeconds?: number;
};

function shouldRunStage(
  stage: PipelineStage,
  ctx: { github: Record<string, unknown>; context: Record<string, unknown> },
): boolean {
  if (!stage.when) {
    return true;
  }
  return evaluateExpression(stage.when, ctx);
}

function hasSkippedDependency(stage: PipelineStage, skipped: Set<string>): boolean {
  return (stage.needs ?? []).some((dep) => skipped.has(dep));
}

async function workflowDigestForStage(
  stage: PipelineStage,
  options: OrchestratorOptions,
  baseClient: GitHubActionsClient,
  repoClients: Map<string, GitHubActionsClient>,
): Promise<string | undefined> {
  const contentPath = stage.workflow ?? stage.pipeline_file;
  if (!contentPath) {
    return undefined;
  }
  if (stage.repo) {
    const client = await clientForStage(repoClients, baseClient, stage, options);
    return workflowRemoteDigest(client, contentPath, options.ref);
  }
  if (options.repoRoot) {
    return workflowFileDigest(options.repoRoot, contentPath);
  }
  return undefined;
}

function missingRequiredContext(
  stage: PipelineStage,
  context: Record<string, Record<string, string>>,
): string | null {
  if (!stage.inputs) {
    return null;
  }
  for (const value of Object.values(stage.inputs)) {
    const match = value.match(/\$\{\{\s*context\.([a-z0-9-]+)\.([a-z0-9_]+)\s*\}\}/i);
    if (!match) {
      continue;
    }
    const [, stageId, outputKey] = match;
    if (!context[stageId]?.[outputKey]) {
      return `${stageId}.${outputKey}`;
    }
  }
  return null;
}

function outputsFromJobs(
  jobs: WorkflowJob[],
  declaredOutputs: string[],
): Record<string, string> | null {
  // ponytail: last successful job wins; upgrade path is explicit job name matching per stage
  for (let i = jobs.length - 1; i >= 0; i--) {
    const job = jobs[i];
    if (job.conclusion !== 'success' || !job.outputs) {
      continue;
    }
    if (declaredOutputs.every((key) => job.outputs?.[key] != null)) {
      return Object.fromEntries(
        declaredOutputs.map((key) => [key, job.outputs![key]]),
      );
    }
  }
  return null;
}

async function collectStageOutputs(
  client: GitHubActionsClient,
  runId: number,
  stageId: string,
  declaredOutputs: string[] | undefined,
  timeoutMs: number,
  pollMs: number,
): Promise<Record<string, string>> {
  if (!declaredOutputs?.length) {
    return {};
  }

  const jobs = await client.listRunJobs(runId);
  const fromApi = outputsFromJobs(jobs, declaredOutputs);
  if (fromApi) {
    return fromApi;
  }

  const fromArtifact = await client.waitForStageArtifact(
    runId,
    stageId,
    timeoutMs,
    pollMs,
  );
  if (declaredOutputs.every((key) => fromArtifact[key] != null)) {
    return Object.fromEntries(
      declaredOutputs.map((key) => [key, fromArtifact[key]]),
    );
  }

  throw new Error(
    `Could not find outputs for stage "${stageId}" (expected keys: ${declaredOutputs.join(', ')})`,
  );
}

function clientCacheKey(owner: string, repo: string, token: string): string {
  return `${owner}/${repo}#${token.slice(0, 8)}`;
}

async function clientForStage(
  cache: Map<string, GitHubActionsClient>,
  baseClient: GitHubActionsClient,
  stage: PipelineStage,
  options: OrchestratorOptions,
): Promise<GitHubActionsClient> {
  const defaultSlug = `${options.defaultOwner}/${options.defaultRepo}`;

  if (!stage.repo) {
    return baseClient;
  }

  const { owner, repo } = parseRepoSlug(stage.repo);
  let token: string;
  try {
    token = resolveStageToken(stage.repo, defaultSlug, options.githubToken, options.repoTokens);
  } catch (error) {
    if (!options.appTokenProvider) {
      throw error;
    }
    token = await options.appTokenProvider.tokenForRepo(owner, repo);
  }

  if (owner === options.defaultOwner && repo === options.defaultRepo) {
    return baseClient;
  }

  const key = clientCacheKey(owner, repo, token);
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const scoped = new GitHubActionsClient(token, owner, repo, apiUrl, true);
  cache.set(key, scoped);
  return scoped;
}

type StageRunState = {
  skipped: Set<string>;
  context: Record<string, Record<string, string>>;
};

async function runOneStage(
  stage: PipelineStage,
  state: StageRunState,
  options: OrchestratorOptions,
  baseClient: GitHubActionsClient,
  repoClients: Map<string, GitHubActionsClient>,
  timeoutMs: number,
  pollMs: number,
  previousRerun: RerunState | null,
  currentRerun: RerunState,
): Promise<StageResult> {
  const evalCtx = {
    github: options.github,
    context: state.context as Record<string, unknown>,
  };

  if (hasSkippedDependency(stage, state.skipped)) {
    state.skipped.add(stage.id);
    await options.commitStatus?.stageSkipped(stage, 'upstream stage skipped');
    return { stageId: stage.id, runId: 0, outputs: {}, skipped: true };
  }

  if (!shouldRunStage(stage, evalCtx)) {
    state.skipped.add(stage.id);
    await options.commitStatus?.stageSkipped(stage, `when: ${stage.when}`);
    return { stageId: stage.id, runId: 0, outputs: {}, skipped: true };
  }

  const missing = missingRequiredContext(stage, state.context);
  if (missing) {
    throw new Error(
      `Stage "${stage.id}" requires context.${missing} from a stage that did not run`,
    );
  }

  try {
    const stageClient = await clientForStage(repoClients, baseClient, stage, options);
    const inputs = {
      ...(options.subPipelineInputs ?? {}),
      ...resolveStageInputs(stage.inputs, state.context),
    };
    const fingerprint = stageFingerprint(
      stage,
      inputs,
      options.ref,
      await workflowDigestForStage(stage, options, baseClient, repoClients),
    );

    if (stage.pipeline_file) {
      if (!options.repoRoot) {
        throw new Error(`Stage "${stage.id}" uses pipeline_file but repoRoot is not set`);
      }
      await options.commitStatus?.stagePending(stage);
      const nested = resolveSubPipeline(options.repoRoot, stage.pipeline_file, stage.pipeline);
      const nestedResults = await runPipeline(nested, baseClient, {
        ...options,
        subPipelineInputs: inputs,
        commitStatus: undefined,
      });
      const outputs = collectSubPipelineOutputs(nestedResults, stage.outputs, stage.id);
      if (options.smartRerun) {
        currentRerun.stages[stage.id] = { fingerprint, outputs, runId: 0 };
      }
      await options.commitStatus?.stageSuccess(
        stage,
        options.defaultOwner,
        options.defaultRepo,
        0,
      );
      return { stageId: stage.id, runId: 0, outputs };
    }

    if (options.smartRerun && previousRerun && (options.runAttempt ?? 1) > 1) {
      const previous = previousRerun.stages[stage.id];
      if (canReuseStage(previous, fingerprint, stage.outputs)) {
        core.info(`Smart rerun: reusing stage "${stage.id}" from attempt ${(options.runAttempt ?? 1) - 1}`);
        currentRerun.stages[stage.id] = {
          fingerprint: previous!.fingerprint,
          outputs: previous!.outputs,
          runId: previous!.runId,
        };
        const { owner, repo } = stage.repo
          ? parseRepoSlug(stage.repo)
          : { owner: options.defaultOwner, repo: options.defaultRepo };
        await options.commitStatus?.stageSuccess(stage, owner, repo, previous!.runId, true);
        let savedSeconds: number | undefined;
        if (previous!.runId > 0) {
          try {
            savedSeconds = runDurationSeconds(await stageClient.getWorkflowRun(previous!.runId));
          } catch {
            // ponytail: omit savings line when prior run metadata is unavailable
          }
        }
        return {
          stageId: stage.id,
          runId: previous!.runId,
          outputs: previous!.outputs,
          reused: true,
          savedSeconds,
        };
      }
    }

    await options.commitStatus?.stagePending(stage);

    const workflow = await stageClient.getWorkflowByPath(stage.workflow!);
    const dispatchAt = Date.now();

    await stageClient.dispatchWorkflow(workflow.id, options.ref, inputs);

    let run = await stageClient.waitForRun(
      workflow.id,
      options.ref,
      dispatchAt,
      timeoutMs,
      pollMs,
    );

    run = await stageClient.waitForRunCompletion(run.id, timeoutMs, pollMs);

    if (run.conclusion !== 'success') {
      throw new Error(
        `Stage "${stage.id}" failed (${workflow.path}, run ${run.id}, conclusion=${run.conclusion})`,
      );
    }

    const outputs = await collectStageOutputs(
      stageClient,
      run.id,
      stage.id,
      stage.outputs,
      timeoutMs,
      pollMs,
    );

    if (options.smartRerun) {
      currentRerun.stages[stage.id] = { fingerprint, outputs, runId: run.id };
    }

    const { owner, repo } = stage.repo
      ? parseRepoSlug(stage.repo)
      : { owner: options.defaultOwner, repo: options.defaultRepo };
    await options.commitStatus?.stageSuccess(stage, owner, repo, run.id);

    return { stageId: stage.id, runId: run.id, outputs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await options.commitStatus?.stageFailure(stage, message);
    throw error;
  }
}

export async function runPipeline(
  pipeline: Pipeline,
  client: GitHubActionsClient,
  options: OrchestratorOptions,
): Promise<StageResult[]> {
  const timeoutMs = options.timeoutMs ?? 60 * 60 * 1000;
  const pollMs = options.pollMs ?? 10_000;
  const results: StageResult[] = [];
  const state: StageRunState = { skipped: new Set<string>(), context: {} };
  const repoClients = new Map<string, GitHubActionsClient>();
  const smartRerun = Boolean(options.smartRerun);
  const runAttempt = options.runAttempt ?? 1;
  const previousRerun =
    smartRerun && options.currentRunId && runAttempt > 1
      ? await loadPreviousRerunState(client, options.currentRunId, runAttempt)
      : null;
  const currentRerun = emptyRerunState();

  if (options.commitStatus) {
    await options.commitStatus.pipelinePending();
  }

  if (pipeline.concurrency && options.currentRunId) {
    await enforcePipelineConcurrency(client, {
      currentRunId: options.currentRunId,
      ref: options.ref,
      concurrency: pipeline.concurrency,
      github: options.github,
      pollMs,
      timeoutMs: Math.min(timeoutMs, 5 * 60 * 1000),
    });
  }

  const waves = groupStagesIntoWaves(pipeline.stages);

  for (const wave of waves) {
    const waveResults = await Promise.all(
      wave.map((stage) =>
        runOneStage(
          stage,
          state,
          options,
          client,
          repoClients,
          timeoutMs,
          pollMs,
          previousRerun,
          currentRerun,
        ),
      ),
    );

    for (const result of waveResults) {
      if (result.skipped) {
        state.skipped.add(result.stageId);
      } else {
        state.context = mergeContext(state.context, result.stageId, result.outputs) as Record<
          string,
          Record<string, string>
        >;
      }
      results.push(result);
    }

    if (smartRerun && Object.keys(currentRerun.stages).length > 0) {
      await persistRerunState(currentRerun);
    }
  }

  return results;
}
