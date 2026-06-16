# 01 — Problem and approach

**Series:** [Design rationale](README.md) · **Next:** [02 — Orchestration model](02-orchestration-model.md)

## Executive summary

pipeline-compose exists because **GitHub Actions has no synchronous, multi-workflow, multi-repo orchestration primitive**. Teams already solved pieces with scripts, PATs, and `repository_dispatch`; we productized the smallest layer that closes the gap **without** replacing Actions jobs or introducing a new execution cluster.

---

## Context

### What breaks at scale

| Symptom | Root cause in native Actions |
|---------|------------------------------|
| Library PR cannot gate on consumer E2E | No cross-repo `needs:`; status checks are per-repo |
| Release spans app + infra repos | `workflow_call` does not generalize to arbitrary `owner/repo` dispatch |
| “Did repo B finish?” custom polling | `repository_dispatch` is fire-and-forget from repo A’s perspective |
| Pipeline order lives in wiki tables | Graph is implicit across workflow files and human runbooks |
| Re-run after stage 9 fails reruns 1–8 | No first-class “resume DAG” across separate workflow runs |

These are **coordination** failures, not “GitHub Actions is bad.” Single-repo DAGs with `needs:` remain the right tool inside one workflow run.

### Organizational constraints we optimized for

1. **Incremental adoption** — keep existing stage workflows; add one pipeline file + one run step. No forklift to Buildkite/Argo unless the org already decided that.
2. **Actions billing model** — stages stay separate runs (visible in UI, billable per workflow). We did not hide work inside one opaque runner.
3. **Security review friction** — no arbitrary code execution in the orchestrator beyond Node calling GitHub’s REST API; secrets stay in GitHub Actions secret stores.
4. **Small maintainer surface** — ponytail/lazy-senior posture: prefer platform primitives over custom infra.

---

## Decision

Ship a **declarative pipeline YAML** plus:

| Component | Role |
|-----------|------|
| **pipeline-compose-run** | Long-lived orchestrator job: dispatch → poll → merge context → fail parent |
| **pipeline-compose-export** | Standardized artifact upload per stage |
| **packages/core + CLI** | Single semantic source: parse, validate, simulate, compile |
| **pipeline-compose-compile** (optional) | Same semantics, static `needs:` workflow for same-repo teams |

**Non-goals (explicit):**

- Replace GitHub job sandboxing or build caching (Turbo/Nx layer)
- Host a remote workflow registry (v1.5 catalog is file-local)
- Guarantee exactly-once side effects across stages (stages own idempotency)
- Provide a global pause/approve UI (deferred)

---

## Alternatives considered (expanded)

### Monolithic mega-workflow

**Pros:** one run ID, native `needs:`, familiar UI.  
**Cons:** does not cross repos; YAML size and review noise; couples unrelated teams’ workflows in one file.  
**Verdict:** fine inside one repo; not the cross-repo product.

### `repository_dispatch` + custom pollers

**Pros:** minimal dependencies; teams already have scripts.  
**Cons:** every consumer reimplements wait, timeout, context merge, and status aggregation; no shared validate/simulate; on-call debugs bespoke bash.  
**Verdict:** pipeline-compose **is** the extracted poller—with stable contracts and tests.

### Reusable workflows (`workflow_call`) only

**Pros:** first-class Actions feature for same-repo reuse.  
**Cons:** cross-repo `workflow_call` is limited; caller/callee versioning is awkward for org-wide graphs; still no merged “pipeline failed” across unrelated entry workflows.  
**Verdict:** stage workflows may use `workflow_call` internally; orchestration layer stays dispatch-based for repo boundaries.

### Third-party CI (Buildkite, Harness, Argo Workflows, etc.)

**Pros:** mature DAG engines, agents, secrets, observability.  
**Cons:** net-new platform cost, agent pools, migration; many enterprises are **mandated** on GitHub Actions for audit/compliance.  
**Verdict:** valid greenfield; we target **Actions-native** incremental fix.

### Compile-only codegen

**Pros:** auditable committed graph; no polling job.  
**Cons:** cross-repo dispatch in generated YAML still needs token plumbing per target; every pipeline edit regenerates workflow.  
**Verdict:** ship as **second path**, not the only path — see [04](04-run-path-vs-compile-path.md).

### GitHub App as the product (marketplace install)

**Pros:** best UX for cross-repo auth and future PR bot.  
**Cons:** large product surface (install flow, permissions docs, support); auth alone does not orchestrate.  
**Verdict:** v1.6 ships **BYO App** credentials; marketplace App is roadmap — [10](10-cross-repo-authentication.md), [11](11-deferred-and-rejected.md).

---

## Consequences

### What you gain

- **One pipeline outcome** — entry workflow job success/failure reflects all dispatched stages (including cross-repo).
- **Validated graph** — `validate --strict` catches orphan workflows, broken `needs`, bad context refs before merge.
- **Opt-in depth** — smart rerun, sub-pipelines, catalog, schema are YAML flags; simple pipelines stay simple.

### What you pay

- **Orchestrator job duration** — run path holds a runner for the whole pipeline (polling). Cost tradeoff vs fan-out visibility.
- **Artifact ceremony** — every stage with downstream consumers needs export (or equivalent manual upload).
- **Dispatch requirement** — every stage workflow must expose `workflow_dispatch`.
- **Cross-repo secrets** — PAT map or GitHub App credentials are operator responsibilities.

### Blast radius

A bug in **run** affects orchestration only; stage workflows are unchanged. A bug in **validate** fails CI early (desired). Core package bugs affect CLI + all actions — hence monorepo + single core — [05](05-monorepo-and-action-repos.md).

---

## Design principles (how we say “no”)

1. **Platform primitives first** — `workflow_dispatch`, artifacts, `concurrency`, REST polling.
2. **Explicit contracts** — stable validation codes, artifact names, semver on action repos.
3. **Validate before run** — simulate and schema checks mirror runtime skip/block rules where possible (`packages/core/src/compile/simulate.ts` aligns with orchestrator skip logic).
4. **Document shortcuts** — `ponytail:` in code names the ceiling and upgrade path.

---

## Adoption guidance (for PE review)

| Org situation | Recommendation |
|---------------|----------------|
| Single repo, 3–5 workflows, no cross-repo | compile path or even native `needs:` may suffice; compose adds value via validate + mermaid |
| 2–5 repos in one release train | run path + PAT map or App; start with one pipeline file in the “driver” repo |
| Many repos, strict compliance | GitHub App auth; avoid long-lived PATs in `repo_tokens_json` |
| Already on Buildkite for builds | don’t duplicate build orchestration; use compose only for the Actions-shaped release tail |

**Migration path from scripts:** replace poller scripts with run action one stage at a time; keep `repository_dispatch` handlers until cutover.

---

## Revisit criteria

We would reconsider the whole approach if:

- GitHub shipped **first-class cross-repo workflow `needs:` with context merge** (platform makes us redundant).
- Polling + long jobs became **prohibitively expensive** vs an official async orchestration API we could await on.
- Enterprise customers **uniformly** standardized on an external DAG engine and stopped allowing Actions orchestration jobs.

---

## What to read next

- [02 — Orchestration model](02-orchestration-model.md) — runtime loop and failure semantics  
- [04 — Run path vs compile path](04-run-path-vs-compile-path.md) — choosing execution mode  
- [11 — Deferred and rejected](11-deferred-and-rejected.md) — what we are not building yet
