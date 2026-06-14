import { describe, it, expect } from 'vitest';
import { sortStages } from './topo-sort.js';
import type { PipelineStage } from './parser.js';

describe('sortStages', () => {
  it('orders stages by needs', () => {
    const stages: PipelineStage[] = [
      { id: 'deploy', workflow: 'd.yml', needs: ['build'] },
      { id: 'build', workflow: 'b.yml', needs: ['sync'] },
      { id: 'sync', workflow: 's.yml' },
    ];
    expect(sortStages(stages).map((s) => s.id)).toEqual(['sync', 'build', 'deploy']);
  });

  it('throws on unknown need', () => {
    const stages: PipelineStage[] = [
      { id: 'build', workflow: 'b.yml', needs: ['missing'] },
    ];
    expect(() => sortStages(stages)).toThrow(/missing/);
  });
});
