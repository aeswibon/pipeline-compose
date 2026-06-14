import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  loadPipeline,
  parsePipelineDocument,
  type PipelineDocument,
} from './parser.js';
import { pipelineDocumentToList } from './pipeline-resolve.js';

export function loadPipelineDocumentFromFile(filePath: string): PipelineDocument {
  return parsePipelineDocument(fs.readFileSync(filePath, 'utf8'));
}

export function loadPipelineDocumentsFromDirectory(dirPath: string): PipelineDocument[] {
  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')),
    )
    .map((entry) => entry.name)
    .sort();

  if (entries.length === 0) {
    throw new Error(`No pipeline YAML files in ${dirPath}`);
  }

  return entries.map((name) =>
    loadPipelineDocumentFromFile(path.join(dirPath, name)),
  );
}

export function loadPipelineDocumentsFromInputs(opts: {
  pipelineFile?: string;
  pipelineDir?: string;
}): PipelineDocument[] {
  if (opts.pipelineFile && opts.pipelineDir) {
    throw new Error('Specify pipeline_file or pipeline_dir, not both');
  }
  if (opts.pipelineDir) {
    return loadPipelineDocumentsFromDirectory(opts.pipelineDir);
  }
  if (opts.pipelineFile) {
    return [loadPipelineDocumentFromFile(opts.pipelineFile)];
  }
  throw new Error('pipeline_file or pipeline_dir is required');
}

export function loadPipelineFromFile(filePath: string) {
  return loadPipeline({ fileYaml: fs.readFileSync(filePath, 'utf8') });
}
