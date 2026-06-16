import * as core from '@actions/core';
import {
  loadPipelineDocumentsFromInputs,
  validatePipelineDocuments,
} from '@aeswibon/pipeline-compose-core';
import { GitHubAppTokenProvider } from './github-app.js';
import { GitHubActionsClient } from './github.js';
import { runPipeline } from './orchestrator.js';
import { parseRepoTokensJson } from './repo-tokens.js';

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
  const docs = loadPipelineDocumentsFromInputs({ pipelineFile, pipelineDir });
  const pipeline = validatePipelineDocuments(docs);

  core.info(`Running pipeline "${pipeline.name}" on ref ${ref}`);

  const client = new GitHubActionsClient(token, owner, repo);
  const appTokenProvider =
    githubAppId && githubAppPrivateKey
      ? new GitHubAppTokenProvider(githubAppId, githubAppPrivateKey.replace(/\\n/g, '\n'))
      : undefined;
  const currentRunId = Number(process.env.GITHUB_RUN_ID ?? '0') || undefined;
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT ?? '1');
  if (pipeline.smart_rerun && runAttempt === 1) {
    core.info('Smart rerun enabled; state will be saved for workflow re-runs');
  }
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
  });

  core.setOutput('results_json', JSON.stringify(results));
  core.info(`Pipeline completed (${results.length} stage(s)).`);
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));
