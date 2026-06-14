import * as core from '@actions/core';
import { evaluateExpression } from '../lib/expressions.js';

async function run(): Promise<void> {
  const expression = core.getInput('expression', { required: true });
  const contextJson = core.getInput('context') || '{}';
  const githubJson = core.getInput('github') || '{}';

  const context = JSON.parse(contextJson) as Record<string, unknown>;
  const github = JSON.parse(githubJson) as Record<string, unknown>;

  const result = evaluateExpression(expression, { context, github });
  core.setOutput('result', String(result));
  core.info(`Expression "${expression}" => ${result}`);
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));
