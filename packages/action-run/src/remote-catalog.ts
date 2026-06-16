import {
  decodeGitHubFileContent,
  mergeCatalogMaps,
  parseRemoteCatalogYaml,
  type CatalogFromRef,
} from '@aeswibon/pipeline-compose-core';
import { isPipelineV2, type PipelineDocument } from '@aeswibon/pipeline-compose-core';
import type { GitHubActionsClient } from './github.js';
import { parseRepoSlug } from '@aeswibon/pipeline-compose-core';
import { resolveStageToken, type RepoTokenMap } from './repo-tokens.js';
import type { GitHubAppTokenProvider } from './github-app.js';

async function clientForCatalogRepo(
  catalogRepo: string,
  defaultOwner: string,
  defaultRepo: string,
  githubToken: string,
  repoTokens: RepoTokenMap,
  appTokenProvider: GitHubAppTokenProvider | undefined,
  baseClient: GitHubActionsClient,
): Promise<GitHubActionsClient> {
  const defaultSlug = `${defaultOwner}/${defaultRepo}`;
  if (catalogRepo === defaultSlug) {
    return baseClient;
  }
  const { owner, repo } = parseRepoSlug(catalogRepo);
  let token: string;
  try {
    token = resolveStageToken(catalogRepo, defaultSlug, githubToken, repoTokens);
  } catch (error) {
    if (!appTokenProvider) {
      throw error;
    }
    token = await appTokenProvider.tokenForRepo(owner, repo);
  }
  return baseClient.withRepo(owner, repo, token);
}

export async function fetchRemoteCatalog(
  ref: CatalogFromRef,
  baseClient: GitHubActionsClient,
  options: {
    defaultOwner: string;
    defaultRepo: string;
    githubToken: string;
    repoTokens: RepoTokenMap;
    appTokenProvider?: GitHubAppTokenProvider;
  },
): Promise<ReturnType<typeof parseRemoteCatalogYaml>> {
  const client = await clientForCatalogRepo(
    ref.repo,
    options.defaultOwner,
    options.defaultRepo,
    options.githubToken,
    options.repoTokens,
    options.appTokenProvider,
    baseClient,
  );
  const file = await client.getRepositoryContent(ref.path, ref.ref);
  if (!file) {
    throw new Error(`Remote catalog not found: ${ref.repo}:${ref.path}@${ref.ref ?? 'default'}`);
  }
  const yaml = decodeGitHubFileContent(file.content, file.encoding);
  return parseRemoteCatalogYaml(yaml);
}

export async function applyRemoteCatalogToDocuments(
  docs: PipelineDocument[],
  baseClient: GitHubActionsClient,
  options: {
    defaultOwner: string;
    defaultRepo: string;
    githubToken: string;
    repoTokens: RepoTokenMap;
    appTokenProvider?: GitHubAppTokenProvider;
  },
): Promise<PipelineDocument[]> {
  const out: PipelineDocument[] = [];
  for (const doc of docs) {
    if (!isPipelineV2(doc) || !doc.catalog_from) {
      out.push(doc);
      continue;
    }
    const remote = await fetchRemoteCatalog(doc.catalog_from, baseClient, options);
    out.push({
      ...doc,
      catalog: mergeCatalogMaps(remote, doc.catalog),
    });
  }
  return out;
}
