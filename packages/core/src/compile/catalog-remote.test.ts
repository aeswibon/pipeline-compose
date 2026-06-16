import { describe, expect, it } from 'vitest';
import { mergeCatalogMaps, parseRemoteCatalogYaml } from './catalog-remote.js';

describe('catalog-remote', () => {
  it('merges remote under local overrides', () => {
    const merged = mergeCatalogMaps(
      { build: { workflow: '.github/workflows/remote.yml' } },
      { build: { workflow: '.github/workflows/local.yml' } },
    );
    expect(merged?.build.workflow).toBe('.github/workflows/local.yml');
  });

  it('parses v2 catalog yaml', () => {
    const catalog = parseRemoteCatalogYaml(`version: 2
pipelines:
  x:
    stages: []
catalog:
  ci:
    workflow: .github/workflows/ci.yml
`);
    expect(catalog.ci.workflow).toBe('.github/workflows/ci.yml');
  });
});
