import { parsePipelineDocument, type PipelineDocument } from './parser.js';
import type { CatalogEntry } from './catalog.js';

export type CatalogFromRef = {
  repo: string;
  path: string;
  ref?: string;
};

export function mergeCatalogMaps(
  remote: Record<string, CatalogEntry> | undefined,
  local: Record<string, CatalogEntry> | undefined,
): Record<string, CatalogEntry> | undefined {
  if (!remote && !local) {
    return undefined;
  }
  return { ...(remote ?? {}), ...(local ?? {}) };
}

export function catalogFromFetchedDocument(doc: PipelineDocument): Record<string, CatalogEntry> | undefined {
  if ('catalog' in doc && doc.catalog && typeof doc.catalog === 'object') {
    return doc.catalog as Record<string, CatalogEntry>;
  }
  return undefined;
}

export function decodeGitHubFileContent(content: string, encoding: string): string {
  if (encoding === 'base64') {
    return Buffer.from(content, 'base64').toString('utf8');
  }
  return content;
}

export function parseRemoteCatalogYaml(yaml: string): Record<string, CatalogEntry> {
  const doc = parsePipelineDocument(yaml);
  const catalog = catalogFromFetchedDocument(doc);
  if (!catalog || Object.keys(catalog).length === 0) {
    throw new Error('Remote catalog file has no catalog map');
  }
  return catalog;
}
