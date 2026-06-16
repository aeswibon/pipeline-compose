import type { PipelineStage } from './parser.js';

/** Group stages into waves: each wave's members have all `needs` satisfied by prior waves. */
export function groupStagesIntoWaves(stages: PipelineStage[]): PipelineStage[][] {
  if (stages.length === 0) {
    return [];
  }

  const byId = new Map(stages.map((s) => [s.id, s]));
  const pending = new Set(stages.map((s) => s.id));
  const completed = new Set<string>();
  const waves: PipelineStage[][] = [];

  while (pending.size > 0) {
    const wave: PipelineStage[] = [];
    for (const id of pending) {
      const stage = byId.get(id);
      if (!stage) {
        continue;
      }
      if ((stage.needs ?? []).every((dep) => completed.has(dep))) {
        wave.push(stage);
      }
    }
    if (wave.length === 0) {
      throw new Error(
        'Cannot schedule stages: unresolved needs (cycle or unknown dependency)',
      );
    }
    for (const stage of wave) {
      pending.delete(stage.id);
      completed.add(stage.id);
    }
    waves.push(wave);
  }

  return waves;
}
