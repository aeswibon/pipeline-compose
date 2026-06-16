import { describe, it, expect } from 'vitest';
import { groupStagesIntoWaves } from './stage-waves.js';
import type { PipelineStage } from './parser.js';

describe('groupStagesIntoWaves', () => {
  it('puts independent stages in the same wave', () => {
    const stages: PipelineStage[] = [
      { id: 'ci', workflow: 'ci.yml' },
      { id: 'lint', workflow: 'lint.yml', needs: ['ci'] },
      { id: 'test', workflow: 'test.yml', needs: ['ci'] },
      { id: 'deploy', workflow: 'deploy.yml', needs: ['lint', 'test'] },
    ];
    expect(groupStagesIntoWaves(stages).map((w) => w.map((s) => s.id))).toEqual([
      ['ci'],
      ['lint', 'test'],
      ['deploy'],
    ]);
  });

  it('returns one wave when there are no needs edges', () => {
    const stages: PipelineStage[] = [
      { id: 'a', workflow: 'a.yml' },
      { id: 'b', workflow: 'b.yml' },
    ];
    expect(groupStagesIntoWaves(stages)).toHaveLength(1);
    expect(groupStagesIntoWaves(stages)[0]).toHaveLength(2);
  });

  it('throws on unresolved needs', () => {
    expect(() =>
      groupStagesIntoWaves([
        { id: 'a', workflow: 'a.yml', needs: ['missing'] },
        { id: 'b', workflow: 'b.yml', needs: ['a'] },
      ]),
    ).toThrow(/unresolved needs/);
  });
});
