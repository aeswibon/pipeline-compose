import AjvImport from 'ajv';
import type { ResolvedPipeline } from '../compile/parser.js';
import { parseContextInputRefs } from './context-refs.js';
import type { ValidationIssue } from '../compile/validate-report.js';

type AjvValidator = {
  compile: (schema: object) => ((data: unknown) => boolean) & { errors?: object[] | null };
  errorsText: (errors?: object[] | null) => string;
};

type AjvConstructor = new (options?: object) => AjvValidator;
const Ajv = AjvImport as unknown as AjvConstructor;
const ajv = new Ajv({ allErrors: true, strict: false });

type JsonSchemaObject = Record<string, unknown>;

function stageSchema(
  schema: JsonSchemaObject | undefined,
  stageId: string,
): JsonSchemaObject | undefined {
  const properties = schema?.properties as Record<string, JsonSchemaObject> | undefined;
  const stage = properties?.[stageId];
  return stage?.type === 'object' ? stage : undefined;
}

function outputSchema(
  stage: JsonSchemaObject | undefined,
  outputKey: string,
): JsonSchemaObject | undefined {
  const properties = stage?.properties as Record<string, JsonSchemaObject> | undefined;
  return properties?.[outputKey];
}

export function validateContextSchemaDocument(schema: Record<string, unknown>): string | null {
  try {
    ajv.compile(schema);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function collectContextSchemaIssues(
  pipeline: ResolvedPipeline,
): ValidationIssue[] {
  const schema = pipeline.context_schema;
  if (!schema) {
    return [];
  }

  const issues: ValidationIssue[] = [];
  const schemaError = validateContextSchemaDocument(schema);
  if (schemaError) {
    issues.push({
      level: 'error',
      code: 'context-schema.invalid',
      message: `Invalid context_schema: ${schemaError}`,
    });
    return issues;
  }

  if (schema.type !== 'object') {
    issues.push({
      level: 'error',
      code: 'context-schema.shape',
      message: 'context_schema root must be type: object with per-stage properties',
    });
    return issues;
  }

  for (const stage of pipeline.stages) {
    for (const outputKey of stage.outputs ?? []) {
      if (!outputSchema(stageSchema(schema, stage.id), outputKey)) {
        issues.push({
          level: 'error',
          code: 'context-schema.unknown-output',
          message: `Stage "${stage.id}" declares output "${outputKey}" but context_schema has no properties.${stage.id}.properties.${outputKey}`,
        });
      }
    }
  }

  for (const stage of pipeline.stages) {
    if (!stage.inputs) {
      continue;
    }
    for (const value of Object.values(stage.inputs)) {
      for (const { stageId, outputKey } of parseContextInputRefs(value)) {
        if (!outputSchema(stageSchema(schema, stageId), outputKey)) {
          issues.push({
            level: 'error',
            code: 'context-schema.unknown-ref',
            message: `Stage "${stage.id}" references context.${stageId}.${outputKey} but context_schema has no properties.${stageId}.properties.${outputKey}`,
          });
        }
      }
    }
  }

  return issues;
}
