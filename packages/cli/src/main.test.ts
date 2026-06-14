import { describe, it, expect } from 'vitest';
import { evaluateExpression } from '@aeswibon/pipeline-compose-core';

describe('pipeline-compose eval CLI', () => {
  it('evaluates expressions with github and context', () => {
    const result = evaluateExpression("startsWith(github.ref, 'refs/tags/v')", {
      github: { ref: 'refs/tags/v1.0.0' },
      context: { ci: { passed: 'true' } },
    });
    expect(result).toBe(true);
  });
});
