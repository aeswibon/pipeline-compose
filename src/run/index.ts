import * as core from '@actions/core';
import * as fs from 'node:fs';
import { loadPipeline } from '../compile/parser.js';
import { validatePipeline } from '../compile/validator.js';
import { GitHubActionsClient } from './github.js';
import { runPipeline } from './orchestrator.js';

function githubContextFromEnv(): Record<string, unknown> {
  return {
    ref: process.env.GITHUB_REF ?? '',
    sha: process.env.GITHUB_SHA ?? '',
    repository: process.env.GITHUB_REPOSITORY ?? '',
    event_name: process.env.GITHUB_EVENT_NAME ?? '',
    workflow: process.env.GITHUB_WORKFLOW ?? '',
  };
}

async function run(): Promise<void> {
  const pipelineFile = core.getInput('pipeline_file', { required: true });
  const ref = core.getInput('ref') || process.env.GITHUB_REF || '';
  const token =
    core.getInput('github_token') || process.env.GITHUB_TOKEN || '';
  const repository = process.env.GITHUB_REPOSITORY ?? '';

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
  const fileYaml = fs.readFileSync(pipelineFile, 'utf8');
  const pipeline = validatePipeline(loadPipeline({ fileYaml }));

  core.info(`Running pipeline "${pipeline.name}" on ref ${ref}`);

  const client = new GitHubActionsClient(token, owner, repo);
  const results = await runPipeline(pipeline, client, {
    ref,
    github: githubContextFromEnv(),
  });

  core.setOutput('results_json', JSON.stringify(results));
  core.info(`Pipeline completed (${results.length} stage(s)).`);
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));
