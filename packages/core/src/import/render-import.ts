import YAML from 'yaml';
import type { PipelineStage } from '../compile/parser.js';

export function renderImportedPipelineYaml(
  pipelineName: string,
  stages: PipelineStage[],
): string {
  const doc = {
    version: 2,
    pipelines: {
      [pipelineName]: { stages },
    },
  };
  return YAML.stringify(doc).trimEnd() + '\n';
}
