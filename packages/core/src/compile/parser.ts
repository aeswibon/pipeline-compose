import { parse as parseYaml } from 'yaml';

export interface PipelineGroupMeta {
  description?: string;
}

export interface PipelineStage {
  id: string;
  workflow: string;
  group?: string;
  when?: string;
  needs?: string[];
  environment?: string;
  inputs?: Record<string, string>;
  outputs?: string[];
}

export interface Pipeline {
  name: string;
  version: 1;
  group?: string;
  needs?: string[];
  groups?: Record<string, PipelineGroupMeta>;
  /** Workflows not driven by stages but intentionally part of the repo (e.g. native release.yml). */
  companion_workflows?: string[];
  context?: Record<string, string>;
  stages: PipelineStage[];
}

export interface PipelineDefinition {
  group?: string;
  needs?: string[];
  stages: PipelineStage[];
}

export interface PipelineDocumentV2 {
  version: 2;
  groups?: Record<string, PipelineGroupMeta>;
  pipelines: Record<string, PipelineDefinition>;
}

export type PipelineDocument = Pipeline | PipelineDocumentV2;

export interface ResolvedStage extends PipelineStage {
  resolvedGroup?: string;
  pipelineKey?: string;
}

export interface ResolvedPipeline extends Pipeline {
  stages: ResolvedStage[];
}

export function isPipelineV2(doc: PipelineDocument): doc is PipelineDocumentV2 {
  return (doc as PipelineDocumentV2).version === 2;
}

export function parsePipelineDocument(yaml: string): PipelineDocument {
  return parseYaml(yaml) as PipelineDocument;
}

export function resolveStageGroup(
  stage: PipelineStage,
  pipelineGroup?: string,
  pipelineKey?: string,
): string | undefined {
  return stage.group ?? pipelineGroup ?? pipelineKey;
}

export function loadPipeline(opts: {
  fileYaml: string;
  inlineYaml?: string;
}): Pipeline {
  const fileDoc = parseYaml(opts.fileYaml) as Pipeline;
  if (!opts.inlineYaml?.trim()) {
    return fileDoc;
  }
  const inlineDoc = parseYaml(opts.inlineYaml) as Partial<Pipeline>;
  return {
    ...fileDoc,
    context: { ...fileDoc.context, ...inlineDoc.context },
    stages: inlineDoc.stages ?? fileDoc.stages,
  };
}
