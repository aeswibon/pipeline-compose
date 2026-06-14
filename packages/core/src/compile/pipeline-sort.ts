import type { Pipeline } from './parser.js';

export function sortPipelineDocuments(pipelines: Pipeline[]): Pipeline[] {
  const byName = new Map(pipelines.map((p) => [p.name, p]));
  const visited = new Set<string>();
  const out: Pipeline[] = [];

  function visit(name: string) {
    if (visited.has(name)) {
      return;
    }
    const pipeline = byName.get(name);
    if (!pipeline) {
      throw new Error(`Unknown pipeline in needs: ${name}`);
    }
    for (const dep of pipeline.needs ?? []) {
      if (!byName.has(dep)) {
        throw new Error(`Unknown pipeline in needs: ${dep}`);
      }
      visit(dep);
    }
    visited.add(name);
    out.push(pipeline);
  }

  for (const pipeline of pipelines) {
    visit(pipeline.name);
  }
  return out;
}
