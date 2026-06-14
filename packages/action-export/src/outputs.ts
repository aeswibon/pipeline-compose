export const OUTPUTS_DIR = 'pipeline-compose';
export const OUTPUTS_FILE = 'outputs.json';

export function artifactNameForStage(stageId: string): string {
  return `pipeline-compose-${stageId}`;
}

export function parseOutputsJson(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid outputs JSON: ${message}`);
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('outputs must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export function serializeOutputs(outputs: Record<string, unknown>): string {
  return JSON.stringify(outputs);
}
