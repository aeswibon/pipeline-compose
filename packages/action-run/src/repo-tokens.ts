export type RepoTokenMap = Record<string, string>;

export function parseRepoTokensJson(raw: string): RepoTokenMap {
  if (!raw.trim()) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid repo_tokens_json: ${message}`);
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('repo_tokens_json must be a JSON object');
  }
  const map: RepoTokenMap = {};
  for (const [slug, token] of Object.entries(parsed)) {
    if (typeof token !== 'string' || !token) {
      throw new Error(`repo_tokens_json["${slug}"] must be a non-empty string`);
    }
    map[slug] = token;
  }
  return map;
}

export function resolveStageToken(
  stageRepo: string | undefined,
  defaultRepo: string,
  githubToken: string,
  repoTokens: RepoTokenMap,
): string {
  if (!stageRepo || stageRepo === defaultRepo) {
    return githubToken;
  }
  const mapped = repoTokens[stageRepo];
  if (!mapped) {
    throw new Error(
      `Stage targets repo "${stageRepo}" but repo_tokens_json has no entry for that slug`,
    );
  }
  return mapped;
}
