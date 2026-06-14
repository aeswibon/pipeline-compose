import AjvImport from 'ajv';
import type {
  Pipeline,
  PipelineDocument,
  PipelineDocumentV2,
  PipelineStage,
  ResolvedPipeline,
} from './parser.js';
import { isPipelineV2 } from './parser.js';
import { mergePipelines, pipelineDocumentToList, resolvePipelineDocument } from './pipeline-resolve.js';
import { sortStages } from './topo-sort.js';
import schemaV1 from '../../schema/pipeline-v1.schema.json' with { type: 'json' };
import schemaV2 from '../../schema/pipeline-v2.schema.json' with { type: 'json' };

type AjvValidator = {
  compile: (schema: object) => ((data: unknown) => boolean) & { errors?: object[] | null };
  errorsText: (errors?: object[] | null) => string;
};

type AjvConstructor = new (options?: object) => AjvValidator;

const Ajv = AjvImport as unknown as AjvConstructor;

const ajv = new Ajv({ allErrors: true, strict: false });
type SchemaValidate = ((data: unknown) => boolean) & { errors?: object[] | null };
ajv.compile(schemaV1 as object);
const validateV2 = ajv.compile(schemaV2 as object) as SchemaValidate;

export const V1_UNSUPPORTED_MESSAGE =
  'Pipeline schema v1 is not supported in 1.0.0; migrate to version: 2 with pipelines: map (see docs/migration/v0.5.md)';

function assertSchema(
  label: string,
  validate: ((data: unknown) => boolean) & { errors?: object[] | null },
  data: unknown,
): void {
  if (!validate(data)) {
    throw new Error(`Invalid ${label}: ${ajv.errorsText(validate.errors)}`);
  }
}

function assertUniqueStageIds(stages: PipelineStage[]): void {
  const ids = new Set<string>();
  for (const stage of stages) {
    if (ids.has(stage.id)) {
      throw new Error(`Duplicate stage id: ${stage.id}`);
    }
    ids.add(stage.id);
  }
}

function assertV2Document(doc: PipelineDocument): asserts doc is PipelineDocumentV2 {
  if (!isPipelineV2(doc)) {
    throw new Error(V1_UNSUPPORTED_MESSAGE);
  }
}

function validateV2Document(doc: PipelineDocumentV2): void {
  assertSchema('pipeline v2', validateV2, doc);
  for (const def of Object.values(doc.pipelines)) {
    assertUniqueStageIds(def.stages);
    sortStages(def.stages);
  }
}

export function validatePipelineDocument(doc: PipelineDocument): ResolvedPipeline {
  assertV2Document(doc);
  validateV2Document(doc);
  return resolvePipelineDocument(doc);
}

export function validatePipelineDocuments(docs: PipelineDocument[]): ResolvedPipeline {
  const pipelines = [];
  for (const doc of docs) {
    assertV2Document(doc);
    validateV2Document(doc);
    pipelines.push(...pipelineDocumentToList(doc));
  }
  const merged = mergePipelines(pipelines);
  merged.schemaVersion = 2;
  return merged;
}

/** @deprecated Pipeline v1 removed in 1.0.0 — use validatePipelineDocument with version: 2. */
export function validatePipeline(_pipeline: Pipeline): Pipeline {
  throw new Error(V1_UNSUPPORTED_MESSAGE);
}
