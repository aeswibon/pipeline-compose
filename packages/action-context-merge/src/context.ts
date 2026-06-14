import * as fs from 'node:fs';

export function parseJsonObject(label: string, raw: string): Record<string, unknown> {
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

export function readContextFile(contextFile: string): Record<string, unknown> {
  if (!fs.existsSync(contextFile)) {
    return {};
  }
  const parsed = JSON.parse(fs.readFileSync(contextFile, 'utf8')) as unknown;
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('context file must contain a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export function mergeStageOutputs(
  context: Record<string, unknown>,
  stageId: string,
  outputs: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...context,
    [stageId]: outputs,
  };
}

export function writeContextFile(contextFile: string, context: Record<string, unknown>): void {
  fs.writeFileSync(contextFile, `${JSON.stringify(context, null, 2)}\n`);
}
