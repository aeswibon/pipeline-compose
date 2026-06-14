import * as core from '@actions/core';
import { evaluateExpression } from '@aeswibon/pipeline-compose-core';

function parseJsonObject(label: string, raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${label} JSON: ${message}`);
  }
}

async function run(): Promise<void> {
  const expression = core.getInput('expression', { required: true });
  const context = parseJsonObject('context', core.getInput('context') || '{}');
  const github = parseJsonObject('github', core.getInput('github') || '{}');

  const result = evaluateExpression(expression, { context, github });
  core.setOutput('result', String(result));
  core.info(`Expression "${expression}" => ${result}`);
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));
