# 14 — Global concurrency

**Series:** [Design rationale](README.md) · **Prev:** [13 — Meta release pipeline](13-meta-release-pipeline.md) · **Next:** [15 — Remote catalog fetch](15-remote-catalog-fetch.md)

**Shipped:** v1.8.0 · **Schema:** `concurrency.global: true` + optional `lock_repo`

## Executive summary

Per-repo `concurrency:` blocks overlapping runs of **one entry workflow**. **Global concurrency** coordinates **across repositories** that share a fragile environment (staging cluster, shared integration account, license pool) using a small JSON lock file in a designated repo—no Redis, no new service.

---

## Context

### Per-repo concurrency is not enough

```yaml
# service-a pipeline
concurrency:
  group: deploy-staging
```

```yaml
# service-b pipeline (different repo)
concurrency:
  group: deploy-staging
```

These groups are **independent**. Two pipelines can still deploy to staging concurrently.

### External queue rejected

[11 — Deferred](11-deferred-and-rejected.md) records why we did not add SQS/Redis. Operators already run GitHub + Actions; another HA datastore is a different product.

---

## Decision

### Lock file contract

| Field | Value |
|-------|--------|
| Path | `.pipeline-compose/locks/<sanitized-group>.json` |
| Holder | `{ owner, repo, workflow_run_id }` |
| Acquire | Compare-and-swap via Contents API (`putRepositoryContent` with `sha`) |
| Release | Delete file on pipeline completion (`finally` in run action) |

`lock_repo` defaults to the **entry repository** when omitted; set explicitly for org-wide locks (e.g. `my-org/pipeline-locks`).

### Runtime flow

```text
pipeline-compose-run (entry)
  resolve concurrency.group (expressions)
  if concurrency.global:
    acquireGlobalConcurrencyLock()   # poll until free or timeout
    try { runPipeline(...) }
    finally { release lock }
```

Stale locks: if holder `workflow_run_id` is no longer `in_progress`/`queued`, lock is treated as abandoned and overwritten.

### Permissions

| Token surface | Scope |
|---------------|--------|
| Entry workflow | `contents: read` + `contents: write` on `lock_repo` |
| Cross-repo lock repo | `repo_tokens_json` or GitHub App installation token |

`validate` emits **`concurrency.global`** warn and **`concurrency.lock-repo-*`** errors when misconfigured.

---

## Consequences

| Gain | Cost |
|------|------|
| Cross-repo mutual exclusion without new infra | Contents API latency + poll loop on contention |
| Visible lock state in git (auditable) | Lock repo write access is sensitive |
| Works with existing PAT / App model | Not a fair queue—first writer wins after stale detection |

---

## Operations

| Symptom | Likely cause |
|---------|----------------|
| Hang at “lock acquired” | Another pipeline holds lock; raise timeout or fix stuck run |
| 403 on lock repo | Missing `contents: write` or token map entry |
| Orphan lock file | Crashed runner before `finally`; wait for stale detection or delete file manually |

Example fixture: [examples/catalog-global](../../examples/catalog-global/).

---

## Revisit criteria

- Need **FIFO queue** or **priority** → external coordinator or GitHub Environment protection rules
- Lock API rate limits bite at scale → shard lock paths per environment

## Series index

[README](README.md)
