import { parse as parseYaml } from 'yaml';

export interface PipelineStage {
  id: string;
  workflow: string;
  when?: string;
  needs?: string[];
  environment?: string;
  inputs?: Record<string, string>;
  outputs?: string[];
}

export interface Pipeline {
  name: string;
  version: 1;
  context?: Record<string, string>;
  stages: PipelineStage[];
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
