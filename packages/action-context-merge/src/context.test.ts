import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mergeStageOutputs,
  parseJsonObject,
  readContextFile,
  writeContextFile,
} from './context.js';

const tempFiles: string[] = [];

afterEach(() => {
  for (const file of tempFiles.splice(0)) {
    fs.rmSync(file, { force: true });
  }
});

function tempContextFile(initial?: string): string {
  const file = path.join(os.tmpdir(), `pipeline-context-${Date.now()}-${Math.random()}.json`);
  tempFiles.push(file);
  if (initial != null) {
    fs.writeFileSync(file, initial);
  }
  return file;
}

describe('parseJsonObject', () => {
  it('parses outputs object', () => {
    expect(parseJsonObject('outputs', '{"version":"1.0.0"}')).toEqual({ version: '1.0.0' });
  });

  it('rejects non-objects', () => {
    expect(() => parseJsonObject('outputs', '[]')).toThrow(/outputs must be a JSON object/);
  });
});

describe('readContextFile', () => {
  it('returns empty object when file is missing', () => {
    expect(readContextFile(tempContextFile())).toEqual({});
  });

  it('reads existing context', () => {
    const file = tempContextFile('{"ci":{"passed":"true"}}');
    expect(readContextFile(file)).toEqual({ ci: { passed: 'true' } });
  });

  it('rejects invalid root shape', () => {
    const file = tempContextFile('[]');
    expect(() => readContextFile(file)).toThrow(/JSON object/);
  });
});

describe('mergeStageOutputs', () => {
  it('adds stage outputs under stage id', () => {
    expect(
      mergeStageOutputs({ ci: { passed: 'true' } }, 'version-sync', { version: '1.0.0' }),
    ).toEqual({
      ci: { passed: 'true' },
      'version-sync': { version: '1.0.0' },
    });
  });
});

describe('writeContextFile', () => {
  it('writes pretty-printed JSON', () => {
    const file = tempContextFile();
    writeContextFile(file, { a: { b: '1' } });
    expect(fs.readFileSync(file, 'utf8')).toBe('{\n  "a": {\n    "b": "1"\n  }\n}\n');
  });
});
