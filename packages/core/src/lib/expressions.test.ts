import { describe, it, expect } from 'vitest';
import { evaluateExpression, mergeContext, parseRepoSlug } from './expressions.js';

describe('evaluateExpression', () => {
  it('evaluates startsWith on github.ref', () => {
    const result = evaluateExpression("startsWith(github.ref, 'refs/tags/v')", {
      github: { ref: 'refs/tags/v1.0.0' },
      context: {},
    });
    expect(result).toBe(true);
  });

  it('reads context.stage.output', () => {
    const result = evaluateExpression("context.build.image_tag == '1.0.0'", {
      github: {},
      context: { build: { image_tag: '1.0.0' } },
    });
    expect(result).toBe(true);
  });

  it('evaluates github.ref equality', () => {
    const result = evaluateExpression("github.ref == 'refs/heads/master'", {
      github: { ref: 'refs/heads/master' },
      context: {},
    });
    expect(result).toBe(true);
  });

  it('evaluates contains on github.ref', () => {
    const result = evaluateExpression("contains(github.ref, 'tags/v')", {
      github: { ref: 'refs/tags/v1.0.0' },
      context: {},
    });
    expect(result).toBe(true);
  });

  it('evaluates literal true and false', () => {
    expect(evaluateExpression('true', { github: {}, context: {} })).toBe(true);
    expect(evaluateExpression('false', { github: {}, context: {} })).toBe(false);
  });

  it('rejects unsupported expressions', () => {
    expect(() =>
      evaluateExpression('github.event_name == push', { github: {}, context: {} }),
    ).toThrow(/Unsupported expression/);
  });

  it('evaluates && and || combinations', () => {
    expect(
      evaluateExpression("true && false || true", {
        github: {},
        context: {},
      }),
    ).toBe(true);
    expect(
      evaluateExpression("startsWith(github.ref, 'refs/tags/v') && context.ci.passed == 'true'", {
        github: { ref: 'refs/tags/v1.0.0' },
        context: { ci: { passed: 'true' } },
      }),
    ).toBe(true);
  });
});

describe('parseRepoSlug', () => {
  it('parses owner/repo slugs', () => {
    expect(parseRepoSlug('my-org/my-repo')).toEqual({
      owner: 'my-org',
      repo: 'my-repo',
    });
  });

  it('rejects invalid slugs', () => {
    expect(() => parseRepoSlug('not-a-slug')).toThrow(/Invalid repo slug/);
  });
});

describe('mergeContext', () => {
  it('merges stage outputs under stage id', () => {
    const merged = mergeContext({ sha: 'abc' }, 'build', { image_tag: '1.0.0' });
    expect(merged).toEqual({
      sha: 'abc',
      build: { image_tag: '1.0.0' },
    });
  });
});
