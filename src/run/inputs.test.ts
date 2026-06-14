import { describe, it, expect } from 'vitest';
import { resolveInputValue, resolveStageInputs } from './inputs.js';

describe('resolveStageInputs', () => {
  it('rewrites context references to prior stage outputs', () => {
    const context = {
      'version-sync': { version: '1.2.3', skip_publish: 'false' },
    };
    expect(
      resolveStageInputs(
        {
          version: '${{ context.version-sync.version }}',
          skip_publish: '${{ context.version-sync.skip_publish }}',
        },
        context,
      ),
    ).toEqual({
      version: '1.2.3',
      skip_publish: 'false',
    });
  });

  it('leaves literal values unchanged', () => {
    expect(resolveInputValue('true', {})).toBe('true');
  });
});
