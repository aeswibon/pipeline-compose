import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import {
  OUTPUTS_FILE,
  artifactNameForStage,
  artifactUploadFiles,
  parseOutputsJson,
  resolveOutputPaths,
  serializeOutputs,
} from './outputs.js';

describe('artifactNameForStage', () => {
  it('prefixes stage id', () => {
    expect(artifactNameForStage('version-sync')).toBe('pipeline-compose-version-sync');
  });
});

describe('parseOutputsJson', () => {
  it('accepts a JSON object', () => {
    expect(parseOutputsJson('{"version":"1.0.0"}')).toEqual({ version: '1.0.0' });
  });

  it('rejects invalid JSON', () => {
    expect(() => parseOutputsJson('{')).toThrow(/Invalid outputs JSON/);
  });

  it('rejects arrays', () => {
    expect(() => parseOutputsJson('[]')).toThrow(/JSON object/);
  });
});

describe('serializeOutputs', () => {
  it('writes compact JSON', () => {
    expect(serializeOutputs({ version: '1.0.0', skip_publish: 'false' })).toBe(
      '{"version":"1.0.0","skip_publish":"false"}',
    );
  });
});

describe('resolveOutputPaths', () => {
  it('places outputs.json under pipeline-compose/', () => {
    const { outDir, outPath } = resolveOutputPaths('/repo');
    expect(outDir).toBe(path.join('/repo', 'pipeline-compose'));
    expect(outPath).toBe(path.join('/repo', 'pipeline-compose', OUTPUTS_FILE));
  });
});

describe('artifactUploadFiles', () => {
  it('uses absolute file path for artifact client', () => {
    const outPath = '/repo/pipeline-compose/outputs.json';
    expect(artifactUploadFiles(outPath)).toEqual([outPath]);
  });
});

describe('OUTPUTS_FILE', () => {
  it('matches run artifact contract', () => {
    expect(OUTPUTS_FILE).toBe('outputs.json');
  });
});
