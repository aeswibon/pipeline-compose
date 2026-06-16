import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PipelineDocument, PipelineStage, ResolvedPipeline } from './parser.js';
import { isPipelineV2 } from './parser.js';
import { resolvePipelineDocument } from './pipeline-resolve.js';
import { loadPipelineDocumentFromFile } from './pipeline-load.js';

export function isSubPipelineStage(stage: PipelineStage): boolean {
  return Boolean(stage.pipeline_file);
}

export function resolveSubPipeline(
  repoRoot: string,
  pipelineFile: string,
  pipelineKey?: string,
): ResolvedPipeline {
  const absolute = path.resolve(repoRoot, pipelineFile);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Sub-pipeline file not found: ${pipelineFile}`);
  }

  const doc = loadPipelineDocumentFromFile(absolute);
  if (!isPipelineV2(doc)) {
    throw new Error(`Sub-pipeline ${pipelineFile} must use pipeline schema v2`);
  }

  const keys = Object.keys(doc.pipelines);
  if (keys.length === 0) {
    throw new Error(`Sub-pipeline ${pipelineFile} has no pipelines`);
  }

  const selected = pipelineKey ?? (keys.length === 1 ? keys[0] : undefined);
  if (!selected) {
    throw new Error(
      `Sub-pipeline ${pipelineFile} defines multiple pipelines; set pipeline: <key> (${keys.join(', ')})`,
    );
  }
  if (!doc.pipelines[selected]) {
    throw new Error(`Sub-pipeline ${pipelineFile} has no pipeline "${selected}"`);
  }

  const nested = resolvePipelineDocument({
    ...doc,
    pipelines: { [selected]: doc.pipelines[selected] },
  });

  for (const stage of nested.stages) {
    if (isSubPipelineStage(stage)) {
      throw new Error(
        `Sub-pipeline nesting is limited to one level (stage "${stage.id}" in ${pipelineFile})`,
      );
    }
    if (!stage.workflow) {
      throw new Error(`Sub-pipeline stage "${stage.id}" in ${pipelineFile} must use workflow`);
    }
  }

  return nested;
}

export function nestedDeclaredOutputs(pipeline: ResolvedPipeline): Set<string> {
  const keys = new Set<string>();
  for (const stage of pipeline.stages) {
    for (const output of stage.outputs ?? []) {
      keys.add(output);
    }
  }
  return keys;
}

export function collectSubPipelineOutputs(
  results: Array<{ stageId: string; outputs: Record<string, string>; skipped?: boolean }>,
  declaredOutputs: string[] | undefined,
  parentStageId: string,
): Record<string, string> {
  if (!declaredOutputs?.length) {
    return {};
  }

  const flat: Record<string, string> = {};
  for (const result of results) {
    if (result.skipped) {
      continue;
    }
    Object.assign(flat, result.outputs);
  }

  const outputs: Record<string, string> = {};
  for (const key of declaredOutputs) {
    const value = flat[key];
    if (value == null) {
      throw new Error(
        `Sub-pipeline stage "${parentStageId}" did not produce output "${key}"`,
      );
    }
    outputs[key] = value;
  }
  return outputs;
}

export function listWorkflowPaths(pipeline: ResolvedPipeline, repoRoot: string): string[] {
  const paths: string[] = [];
  for (const stage of pipeline.stages) {
    if (stage.workflow) {
      paths.push(path.normalize(path.resolve(repoRoot, stage.workflow)));
    }
  }
  return paths;
}

export function loadPipelineDocumentChecked(filePath: string): PipelineDocument {
  return loadPipelineDocumentFromFile(filePath);
}
