import { describe, it, expect } from 'vitest';
import { parseContextInputRefs } from './context-refs.js';

describe('parseContextInputRefs', () => {
  it('extracts stage and output keys', () => {
    expect(
      parseContextInputRefs('${{ context.version-sync.version }}'),
    ).toEqual([{ stageId: 'version-sync', outputKey: 'version' }]);
  });

  it('returns empty for non-context values', () => {
    expect(parseContextInputRefs('literal')).toEqual([]);
  });
});
