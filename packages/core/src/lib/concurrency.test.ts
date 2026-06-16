import { describe, it, expect } from 'vitest';
import { resolveConcurrencyGroup, concurrencyFromCodegen } from './concurrency.js';

describe('resolveConcurrencyGroup', () => {
  it('substitutes github context fields', () => {
    expect(
      resolveConcurrencyGroup('release-${{ github.ref }}', {
        ref: 'refs/tags/v1.0.0',
      }),
    ).toBe('release-refs/tags/v1.0.0');
  });
});

describe('concurrencyFromCodegen', () => {
  it('uses pipeline concurrency when set', () => {
    expect(
      concurrencyFromCodegen(
        { group: 'release-${{ github.ref }}', cancel_in_progress: true },
        'fallback',
      ),
    ).toEqual({
      group: 'release-${{ github.ref }}',
      'cancel-in-progress': true,
    });
  });
});
