import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  OUTPUTS_DIR,
  OUTPUTS_FILE,
  artifactNameForStage,
  parseOutputsJson,
  serializeOutputs,
} from './outputs.js';

const RETENTION_DAYS = 1;

async function run(): Promise<void> {
  const stageId = core.getInput('stage_id', { required: true });
  const outputsRaw = core.getInput('outputs', { required: true });
  const outputs = parseOutputsJson(outputsRaw);

  const outDir = path.join(process.cwd(), OUTPUTS_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, OUTPUTS_FILE);
  fs.writeFileSync(outPath, serializeOutputs(outputs));

  const artifactName = artifactNameForStage(stageId);
  const client = new DefaultArtifactClient();
  const { id, size } = await client.uploadArtifact(
    artifactName,
    [OUTPUTS_FILE],
    outDir,
    { retentionDays: RETENTION_DAYS },
  );

  core.info(`Uploaded artifact ${artifactName} (id=${id}, bytes=${size})`);
}

run().catch((error) => core.setFailed(error instanceof Error ? error.message : String(error)));
