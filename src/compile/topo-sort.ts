import type { PipelineStage } from './parser.js';

export function sortStages(stages: PipelineStage[]): PipelineStage[] {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const out: PipelineStage[] = [];

  function visit(id: string) {
    if (visited.has(id)) {
      return;
    }
    const stage = byId.get(id);
    if (!stage) {
      throw new Error(`Unknown stage: ${id}`);
    }
    for (const dep of stage.needs ?? []) {
      if (!byId.has(dep)) {
        throw new Error(`Unknown stage in needs: ${dep}`);
      }
      visit(dep);
    }
    visited.add(id);
    out.push(stage);
  }

  for (const s of stages) {
    visit(s.id);
  }
  return out;
}
