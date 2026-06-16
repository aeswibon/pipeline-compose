# 15 — Remote catalog fetch

**Series:** [Design rationale](README.md) · **Prev:** [14 — Global concurrency](14-global-concurrency.md) · **Next:** [11 — Deferred and rejected](11-deferred-and-rejected.md)

**Shipped:** v1.8.0 · **Schema:** `catalog_from: { repo, path, ref? }` on pipeline v2

## Executive summary

[v1.5 local catalog](08-stage-catalog.md) proved merge semantics offline. **Remote fetch** loads the same `catalog:` map from another repository at **run time**, with local keys overriding remote—CircleCI-orbs-shaped ergonomics without a marketplace yet.

---

## Context

### Copy-paste across repos

Platform teams publish standard stage templates (`deploy-k8s`, `smoke-test`). Application repos duplicated YAML until local `catalog:` helped **within one file**. Sharing across repos still meant copy or submodule.

### Why not a registry first

Remote supply chain needs versioning policy, breaking-change notices, and legal review. Fetching **raw YAML from a git repo you already trust** reuses existing code-review and tag semantics.

---

## Decision

### Schema

```yaml
catalog_from:
  repo: my-org/pipeline-catalog
  path: .github/pipelines/catalog.yml
  ref: v1.2.0   # optional; default branch when omitted
catalog:
  deploy:        # local entry overrides remote key
    workflow: .github/workflows/deploy.yml
```

### Merge order (`mergeCatalogMaps`)

```text
effective_catalog = { ...remote, ...local }
```

Local always wins on key collision—apps can fork one template without forking the whole catalog repo.

### Run path

`applyRemoteCatalogToDocuments()` in `packages/action-run/src/remote-catalog.ts`:

1. For each v2 document with `catalog_from`, fetch file via Contents API.
2. Parse YAML; require root `catalog` map.
3. Merge into document before `resolvePipeline`.

**Validate path** does not fetch (offline). Emits **`catalog-from.*`** warnings/errors for shape only. CI fixtures include local catalog entries so `use:` resolves without network—see [catalog-global example](../../examples/catalog-global/).

### Auth

Same resolution order as cross-repo stages: `repo_tokens_json` slug → GitHub App installation token → fail with clear error.

---

## Consequences

| Gain | Cost |
|------|------|
| DRY across repos with git-native pins (`ref:`) | Run requires network + token |
| Override without editing catalog repo | Validate cannot prove remote keys exist |
| No new artifact format | Catalog file must stay v2-compatible YAML |

---

## Relationship to v1.9 smart rerun

Cross-repo stages now include **workflow file content hash** in smart-rerun fingerprints (Contents API). Editing a shared catalog workflow invalidates reuse for that stage.

---

## Revisit criteria

- Org wants **signed catalog bundles** → separate verification layer before merge
- High churn catalogs → cache by `ref` + blob sha with TTL (not implemented)

## Series index

[README](README.md)
