import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';
import * as fs from 'node:fs';
import {
  artifactNameForStage,
  artifactUploadFiles,
  parseOutputsJson,
  resolveOutputPaths,
  serializeOutputs,
} from './outputs.js';

const RETENTION_DAYS = 1;

async function run(): Promise<void> {
  const stageId = core.getInput('stage_id', { required: true });
  const outputsRaw = core.getInput('outputs', { required: true });
  const outputs = parseOutputsJson(outputsRaw);

  const { outDir, outPath } = resolveOutputPaths(process.cwd());
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, serializeOutputs(outputs));

  const artifactName = artifactNameForStage(stageId);
  const client = new DefaultArtifactClient();
  const { id, size } = await client.uploadArtifact(
    artifactName,
    artifactUploadFiles(outPath),
    outDir,
    { retentionDays: RETENTION_DAYS },
  );

  core.info(`Uploaded artifact ${artifactName} (id=${id}, bytes=${size})`);
}

run().catch((error) => core.setFailed(error instanceof Error ? error.message : String(error)));
