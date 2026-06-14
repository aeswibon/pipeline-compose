import * as core from '@actions/core';
import {
  mergeStageOutputs,
  parseJsonObject,
  readContextFile,
  writeContextFile,
} from './context.js';

async function run(): Promise<void> {
  const contextFile = core.getInput('context_file') || 'pipeline-context.json';
  const stageId = core.getInput('stage_id', { required: true });
  const outputs = parseJsonObject('outputs', core.getInput('outputs', { required: true }));

  const existing = readContextFile(contextFile);
  const merged = mergeStageOutputs(existing, stageId, outputs);
  writeContextFile(contextFile, merged);

  core.info(`Merged outputs for stage "${stageId}" into ${contextFile}`);
}

run().catch((error) => core.setFailed(error instanceof Error ? error.message : String(error)));
