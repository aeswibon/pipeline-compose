import * as core from '@actions/core';
import { readFileSync } from 'node:fs';
import {
  loadPipelineDocumentsFromInputs,
  validatePipelineDocuments,
} from '@aeswibon/pipeline-compose-core';
import {
  CommitStatusReporter,
  parseCommitStatusMode,
  resolveCommitStatusSha,
  shouldReportCommitStatus,
} from './commit-status.js';
import { acquireGlobalConcurrencyLock } from './global-lock-enforce.js';
import { GitHubAppTokenProvider } from './github-app.js';
import { GitHubActionsClient } from './github.js';
import { runPipeline } from './orchestrator.js';
import { applyRemoteCatalogToDocuments } from './remote-catalog.js';
import { parseRepoTokensJson } from './repo-tokens.js';
import { writePipelineRunSummary } from './run-summary.js';

function githubContextFromEnv(): Record<string, unknown> {
  return {
    ref: process.env.GITHUB_REF ?? '',
    sha: process.env.GITHUB_SHA ?? '',
    repository: process.env.GITHUB_REPOSITORY ?? '',
    event_name: process.env.GITHUB_EVENT_NAME ?? '',
    workflow: process.env.GITHUB_WORKFLOW ?? '',
    run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? '1'),
  };
}

function loadGithubEvent(): Record<string, unknown> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(eventPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function run(): Promise<void> {
  const pipelineFile = core.getInput('pipeline_file', { required: false });
  const pipelineDir = core.getInput('pipeline_dir', { required: false });
  const ref = core.getInput('ref') || process.env.GITHUB_REF || '';
  const token =
    core.getInput('github_token') || process.env.GITHUB_TOKEN || '';
  const repoTokens = parseRepoTokensJson(
    core.getInput('repo_tokens_json') || '{}',
  );
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const githubAppId = core.getInput('github_app_id');
  const githubAppPrivateKey = core.getInput('github_app_private_key');
  const commitStatusMode = parseCommitStatusMode(
    core.getInput('commit_status') || 'auto',
  );
  const commitStatusShaInput = core.getInput('commit_status_sha');

  if (!pipelineFile && !pipelineDir) {
    throw new Error('pipeline_file or pipeline_dir input is required');
  }
  if (pipelineFile && pipelineDir) {
    throw new Error('Specify pipeline_file or pipeline_dir, not both');
  }
  if (!token) {
    throw new Error('github_token input or GITHUB_TOKEN env is required');
  }
  if (!repository.includes('/')) {
    throw new Error('GITHUB_REPOSITORY must be set to owner/repo');
  }
  if (!ref) {
    throw new Error('ref input or GITHUB_REF env is required');
  }

  const [owner, repo] = repository.split('/');
  let docs = loadPipelineDocumentsFromInputs({ pipelineFile, pipelineDir });

  core.info(`Running pipeline on ref ${ref}`);

  const client = new GitHubActionsClient(token, owner, repo);
  const appTokenProvider =
    githubAppId && githubAppPrivateKey
      ? new GitHubAppTokenProvider(githubAppId, githubAppPrivateKey.replace(/\\n/g, '\n'))
      : undefined;
  const remoteOptions = {
    defaultOwner: owner,
    defaultRepo: repo,
    githubToken: token,
    repoTokens,
    appTokenProvider,
  };

  docs = await applyRemoteCatalogToDocuments(docs, client, remoteOptions);
  const pipeline = validatePipelineDocuments(docs);

  core.info(`Running pipeline "${pipeline.name}" on ref ${ref}`);

  const event = loadGithubEvent();
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  const commitStatusSha = resolveCommitStatusSha(event, {
    explicitSha: commitStatusShaInput,
    envSha: process.env.GITHUB_SHA,
  });
  const commitStatus =
    shouldReportCommitStatus(commitStatusMode, eventName) && commitStatusSha
      ? new CommitStatusReporter(client, commitStatusSha, pipeline.name)
      : undefined;
  if (shouldReportCommitStatus(commitStatusMode, eventName) && !commitStatusSha) {
    core.warning(
      'commit_status enabled but no target SHA found (set commit_status_sha or run on pull_request)',
    );
  }

  const currentRunId = Number(process.env.GITHUB_RUN_ID ?? '0') || undefined;
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT ?? '1');
  if (pipeline.smart_rerun && runAttempt === 1) {
    core.info('Smart rerun enabled; state will be saved for workflow re-runs');
  }

  let releaseGlobalLock: (() => Promise<void>) | undefined;
  if (pipeline.concurrency?.global && currentRunId) {
    const lock = await acquireGlobalConcurrencyLock(client, {
      concurrency: pipeline.concurrency,
      github: githubContextFromEnv(),
      currentRunId,
      ...remoteOptions,
      pollMs: 10_000,
      timeoutMs: 5 * 60 * 1000,
    });
    releaseGlobalLock = lock.release;
    core.info(
      `Global concurrency lock acquired (group: ${pipeline.concurrency.group}, repo: ${pipeline.concurrency.lock_repo ?? repository})`,
    );
  }

  try {
    const results = await runPipeline(pipeline, client, {
      ref,
      github: githubContextFromEnv(),
      defaultOwner: owner,
      defaultRepo: repo,
      githubToken: token,
      repoTokens,
      appTokenProvider,
      currentRunId,
      smartRerun: pipeline.smart_rerun,
      runAttempt,
      repoRoot: process.env.GITHUB_WORKSPACE || process.cwd(),
      commitStatus,
    });

    core.setOutput('results_json', JSON.stringify(results));
    const reused = results.filter((r) => r.reused).length;
    if (reused > 0) {
      core.info(`Smart rerun: reused ${reused} stage(s) on this attempt`);
    }
    writePipelineRunSummary(pipeline.name, results);
    await commitStatus?.pipelineComplete(
      true,
      `Pipeline "${pipeline.name}" completed (${results.length} stage(s))`,
    );
    core.info(`Pipeline completed (${results.length} stage(s)).`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await commitStatus?.pipelineComplete(false, message);
    throw error;
  } finally {
    await releaseGlobalLock?.();
  }
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));
