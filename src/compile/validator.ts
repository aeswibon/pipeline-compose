import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Pipeline } from './parser.js';
import { sortStages } from './topo-sort.js';

const require = createRequire(import.meta.url);
// Ajv publishes CJS; createRequire avoids ESM default export issues.
const Ajv = require('ajv') as new (opts?: object) => {
  compile: (schema: object) => ((data: unknown) => boolean) & { errors?: object[] | null };
  errorsText: (errors?: object[] | null) => string;
};

const schemaPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../schema/pipeline-v1.schema.json',
);
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

export function validatePipeline(pipeline: Pipeline): Pipeline {
  if (!validateSchema(pipeline)) {
    throw new Error(`Invalid pipeline: ${ajv.errorsText(validateSchema.errors)}`);
  }
  const ids = new Set<string>();
  for (const s of pipeline.stages) {
    if (ids.has(s.id)) {
      throw new Error(`Duplicate stage id: ${s.id}`);
    }
    ids.add(s.id);
  }
  return { ...pipeline, stages: sortStages(pipeline.stages) };
}
