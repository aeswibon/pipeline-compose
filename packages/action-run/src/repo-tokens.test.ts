import { describe, it, expect } from 'vitest';
import { parseRepoTokensJson, resolveStageToken } from './repo-tokens.js';

describe('parseRepoTokensJson', () => {
  it('parses owner/repo map', () => {
    const map = parseRepoTokensJson('{"other-org/other-repo":"pat-secret"}');
    expect(map['other-org/other-repo']).toBe('pat-secret');
  });

  it('returns empty map for blank input', () => {
    expect(parseRepoTokensJson('')).toEqual({});
  });

  it('rejects non-object JSON', () => {
    expect(() => parseRepoTokensJson('[]')).toThrow(/object/i);
  });
});

describe('resolveStageToken', () => {
  const defaultRepo = 'host-org/host-repo';

  it('uses github_token when stage has no repo', () => {
    expect(resolveStageToken(undefined, defaultRepo, 'gh-default', {})).toBe(
      'gh-default',
    );
  });

  it('uses github_token when stage repo matches default', () => {
    expect(
      resolveStageToken('host-org/host-repo', defaultRepo, 'gh-default', {}),
    ).toBe('gh-default');
  });

  it('uses mapped token for external repo', () => {
    expect(
      resolveStageToken('other-org/other-repo', defaultRepo, 'gh-default', {
        'other-org/other-repo': 'remote-pat',
      }),
    ).toBe('remote-pat');
  });

  it('throws when external repo missing from map', () => {
    expect(() =>
      resolveStageToken('other-org/other-repo', defaultRepo, 'gh-default', {}),
    ).toThrow(/repo_tokens_json has no entry for that slug/);
  });
});
