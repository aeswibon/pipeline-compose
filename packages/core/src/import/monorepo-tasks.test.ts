import { describe, expect, it } from 'vitest';
import {
  normalizeDependsOn,
  parseNxTargetDefaults,
  parseRushCommandLine,
  parseTurboTaskGraph,
  stagesFromMonorepoTaskGraph,
  topoSortTaskIds,
} from './monorepo-tasks.js';

describe('normalizeDependsOn', () => {
  it('ignores caret upstream refs', () => {
    expect(normalizeDependsOn(['^build', 'lint'])).toEqual(['lint']);
  });
});

describe('stagesFromMonorepoTaskGraph', () => {
  it('builds stages in dependency order', () => {
    const stages = stagesFromMonorepoTaskGraph({
      build: { dependsOn: ['^build'] },
      test: { dependsOn: ['build'] },
      lint: {},
    });
    expect(stages.map((stage) => stage.id)).toEqual(['build', 'lint', 'test']);
    expect(stages.find((stage) => stage.id === 'test')?.needs).toEqual(['build']);
  });
});

describe('parseTurboTaskGraph', () => {
  it('reads tasks (turbo 2)', () => {
    const graph = parseTurboTaskGraph({ tasks: { build: { dependsOn: ['^build'] } } });
    expect(graph.build).toBeDefined();
  });

  it('reads pipeline (turbo 1)', () => {
    const graph = parseTurboTaskGraph({ pipeline: { ci: {} } });
    expect(graph.ci).toBeDefined();
  });
});

describe('parseNxTargetDefaults', () => {
  it('reads targetDefaults', () => {
    const graph = parseNxTargetDefaults({
      targetDefaults: { build: { dependsOn: ['^build'] } },
    });
    expect(graph.build).toBeDefined();
  });
});

describe('parseRushCommandLine', () => {
  it('reads phased command-line.json self dependencies', () => {
    const graph = parseRushCommandLine({
      phases: [
        { name: '_phase:lite-build' },
        {
          name: '_phase:build',
          dependencies: { self: ['_phase:lite-build'] },
        },
        {
          name: '_phase:test',
          dependencies: { self: ['_phase:lite-build', '_phase:build'] },
        },
      ],
    });
    const stages = stagesFromMonorepoTaskGraph(graph);
    expect(stages.map((stage) => stage.id)).toEqual(['lite-build', 'build', 'test']);
    expect(stages.find((stage) => stage.id === 'test')?.needs).toEqual(['lite-build', 'build']);
  });

  it('falls back to bulk commands when phases are absent', () => {
    const graph = parseRushCommandLine({
      commands: [
        { commandKind: 'global', name: 'prettier' },
        { commandKind: 'bulk', name: 'my-bulk-command' },
      ],
    });
    expect(Object.keys(graph)).toEqual(['my-bulk-command']);
  });

  it('requires phases or bulk commands', () => {
    expect(() => parseRushCommandLine({ commands: [] })).toThrow(/phases or bulk commands/);
  });
});

describe('topoSortTaskIds', () => {
  it('detects cycles', () => {
    expect(() =>
      topoSortTaskIds({
        a: { dependsOn: ['b'] },
        b: { dependsOn: ['a'] },
      }),
    ).toThrow(/cycle/);
  });
});
