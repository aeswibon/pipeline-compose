import { describe, expect, it } from 'vitest';
import {
  OUTPUTS_FILE,
  artifactNameForStage,
  parseOutputsJson,
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

describe('OUTPUTS_FILE', () => {
  it('matches run artifact contract', () => {
    expect(OUTPUTS_FILE).toBe('outputs.json');
  });
});
