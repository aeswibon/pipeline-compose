# catalog-global

Demonstrates **v1.8+** pipeline features validated in CI (no live cross-repo run required):

- **`catalog_from`** — merge a remote catalog at run time (local `catalog` overrides remote keys)
- **`catalog`** — local template entries with `use:`
- **`concurrency.global`** — cross-repo lock files under `.pipeline-compose/locks/`

```bash
pnpm run validate examples/catalog-global/.github/pipelines/pipeline.yml \
  --repo-root examples/catalog-global --workflows --strict
```

At run time, `catalog_from` needs a token with `contents: read` on the catalog repo; global concurrency needs `contents: read/write` on `lock_repo`.
