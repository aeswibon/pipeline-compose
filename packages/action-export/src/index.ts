import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';
import * as fs from 'node:fs';
import { validateStageOutputsAgainstSchema } from '@aeswibon/pipeline-compose-core';
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
  const validateSchema = core.getBooleanInput('validate_schema');
  const contextSchemaRaw = core.getInput('context_schema_json', { required: false });

  if (validateSchema) {
    if (!contextSchemaRaw) {
      throw new Error('validate_schema requires context_schema_json');
    }
    let schema: Record<string, unknown>;
    try {
      schema = JSON.parse(contextSchemaRaw) as Record<string, unknown>;
    } catch {
      throw new Error('context_schema_json must be valid JSON');
    }
    const schemaError = validateStageOutputsAgainstSchema(stageId, outputs, schema);
    if (schemaError) {
      throw new Error(`context_schema validation failed for stage "${stageId}": ${schemaError}`);
    }
  }

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
