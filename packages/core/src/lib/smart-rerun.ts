import { createHash } from 'node:crypto';
import type { PipelineStage } from '../compile/parser.js';

export const RERUN_STATE_ARTIFACT = 'pipeline-compose-rerun-state';

export type RerunStageState = {
  fingerprint: string;
  outputs: Record<string, string>;
  runId: number;
};

export type RerunState = {
  version: 1;
  stages: Record<string, RerunStageState>;
};

export function stageFingerprint(
  stage: PipelineStage,
  inputs: Record<string, string>,
  ref: string,
): string {
  const normalizedRef = ref.replace(/^refs\/heads\//, '').replace(/^refs\/tags\//, '');
  const payload = JSON.stringify({
    id: stage.id,
    workflow: stage.workflow,
    repo: stage.repo ?? '',
    ref: normalizedRef,
    when: stage.when ?? '',
    inputs: Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))),
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function parseRerunState(raw: string): RerunState | null {
  try {
    const parsed = JSON.parse(raw) as RerunState;
    if (parsed?.version !== 1 || typeof parsed.stages !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function canReuseStage(
  previous: RerunStageState | undefined,
  fingerprint: string,
  declaredOutputs: string[] | undefined,
): boolean {
  if (!previous || previous.fingerprint !== fingerprint) {
    return false;
  }
  if (!declaredOutputs?.length) {
    return true;
  }
  return declaredOutputs.every((key) => previous.outputs[key] != null);
}
