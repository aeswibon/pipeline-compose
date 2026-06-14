import * as path from 'node:path';

export const OUTPUTS_DIR = 'pipeline-compose';
export const OUTPUTS_FILE = 'outputs.json';

export function resolveOutputPaths(cwd: string): { outDir: string; outPath: string } {
  const outDir = path.join(cwd, OUTPUTS_DIR);
  const outPath = path.join(outDir, OUTPUTS_FILE);
  return { outDir, outPath };
}

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

export function artifactUploadFiles(outPath: string): string[] {
  return [outPath];
}
