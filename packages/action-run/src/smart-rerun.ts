import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  RERUN_STATE_ARTIFACT,
  parseRerunState,
  type RerunState,
} from '@aeswibon/pipeline-compose-core';
import type { GitHubActionsClient } from './github.js';

const RETENTION_DAYS = 1;
const STATE_FILE = 'rerun-state.json';

export async function loadPreviousRerunState(
  client: GitHubActionsClient,
  currentRunId: number,
  runAttempt: number,
): Promise<RerunState | null> {
  if (runAttempt <= 1) {
    return null;
  }

  const previousRunId = await client.findPreviousAttemptRunId(currentRunId, runAttempt);
  if (!previousRunId) {
    core.info('Smart rerun: no previous workflow attempt found');
    return null;
  }

  const artifacts = await client.listRunArtifacts(previousRunId);
  const match = artifacts.find((artifact) => artifact.name === RERUN_STATE_ARTIFACT);
  if (!match) {
    core.info(`Smart rerun: no ${RERUN_STATE_ARTIFACT} on run ${previousRunId}`);
    return null;
  }

  const raw = await client.downloadArtifactFile(match.id, STATE_FILE);
  const state = parseRerunState(raw);
  if (!state) {
    core.warning(`Smart rerun: invalid state artifact on run ${previousRunId}`);
    return null;
  }

  core.info(
    `Smart rerun: loaded ${Object.keys(state.stages).length} stage(s) from attempt ${runAttempt - 1}`,
  );
  return state;
}

export async function persistRerunState(state: RerunState): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-compose-rerun-'));
  const filePath = path.join(dir, STATE_FILE);
  fs.writeFileSync(filePath, JSON.stringify(state));

  const client = new DefaultArtifactClient();
  await client.uploadArtifact(
    RERUN_STATE_ARTIFACT,
    [{ filePath, searchPath: dir }],
    dir,
    { retentionDays: RETENTION_DAYS },
  );
}

export function emptyRerunState(): RerunState {
  return { version: 1, stages: {} };
}
