# 11 — Deferred and rejected

**Series:** [Design rationale](README.md) · **Prev:** [10 — Cross-repo authentication](10-cross-repo-authentication.md) · **Next:** [12 — Validation, simulate, and PR bot](12-validation-simulate-and-pr-bot.md)

## Executive summary

Not every good idea ships. This document lists **rejected** directions (with reasons), **intentional shortcuts** in code (`ponytail:`), and **deferred roadmap** bets—so senior reviewers do not file “obvious missing feature” bugs that are conscious tradeoffs.

---

## Rejected or removed (do not re-litigate without new evidence)

### Pipeline schema v1

**Decision:** v1.0+ rejects v1 documents (`version: 1` / root `name` + flat stages without `pipelines:` map).

**Why:** dual schema duplicated docs, init output, and validate branches. v2 `pipelines:` map models multi-product files cleanly.

**Migration:** [v1.0 migration](../migration/v1.0.md).

---

### Monorepo subpath action pins

**Decision:** strict validate warns/errors on `uses: org/pipeline-compose/...` and `@master`.

**Why:** consumers need **immutable action-repo tags**, not moving monorepo SHAs.

---

### Unlimited sub-pipeline nesting

**Decision:** hard limit one level ([07](07-sub-pipelines.md)).

**Revisit only if:** real graphs prove two levels insufficient **and** validate/simulate investment is funded.

---

### Runtime JSON Schema enforcement (v1.4)

**Decision:** `context_schema` is validate-time only ([09](09-typed-context-schema.md)).

**Revisit:** optional export-action flag with semver minor.

---

### Orchestrator “continue on failure”

**Decision:** one failed stage fails pipeline ([02](02-orchestration-model.md)).

**Why:** single pipeline result for branch protection. Partial success needs result model + UI design.

---

### External queue / state store for DAG

**Decision:** artifacts + GitHub API only.

**Why:** operating Redis/SQS is not our product; enterprises already struggle to operate CI + one orchestrator.

---

### Compile-only product

**Decision:** run path remains primary ([04](04-run-path-vs-compile-path.md)).

---

## Intentional shortcuts (`ponytail:`)

Documented ceilings with upgrade paths—**not bugs** until revisit criteria hit.

| Location | Shortcut | Upgrade path |
|----------|----------|--------------|
| `orchestrator.ts` `outputsFromJobs` | Last successful job wins | Named job per stage in schema |
| `smart-rerun.ts` fingerprint | No workflow file hash | Content-address workflows in fingerprint |
| `github-app.ts` cache | Per orchestrator job only | Shared cache with TTL if jobs split |
| `concurrency-enforce.ts` | Tag ref heuristics | Explicit ref normalization table |
| Sub-pipeline depth | Max 1 | Configurable `max_nest_depth` |
| Smart rerun retention | 1 day artifact | Operator-configurable retention |

Contributors: **do not remove ponytail without ADR update here.**

---

## Deferred roadmap (conscious non-bets)

From [product growth roadmap](../superpowers/specs/product-growth-roadmap.md) and maintainer judgment. **Not commitments.**

### Distribution & growth

| Item | Why deferred |
|------|----------------|
| **Marketplace GitHub App** | Auth plumbing shipped BYO; product needs install UX, support, security review |
| **PR dry-run bot / App** | `validate --simulate` + mermaid exist; bot is packaging |
| **Remote stage catalog** | Local `catalog:` proves merge; registry is supply chain + legal |
| **Mermaid in PR comments (hosted)** | CLI works; hosted bot is ops |

### Observability & DX

| Item | Why deferred |
|------|----------------|
| **OpenTelemetry cross-run traces** | High value; large surface; no standard in Actions |
| **`pipeline-compose local` multi-repo** | act is single-repo; simulate covers most PR needs |
| **CI minutes saved metric** | Needs counterfactual baseline per stage |
| **Slack/intelligent notifications** | Integration sprawl; users use existing Actions slack actions |

### Platform expansion

| Item | Why deferred |
|------|----------------|
| **Turbo/Nx/Rush import** | High value adapters; each tool is a project |
| **Global approval gates** | Needs durable listener or GitHub Environment integration design |
| **Global pipeline state store** | Artifacts + context suffice for DAG |
| **AI autoremediation** | Non-deterministic; core must stay boring |
| **Standalone executor (non-GitHub)** | Different company/product |

### Auth & enterprise

| Item | Why deferred |
|------|----------------|
| **First-party App in Marketplace** | v1.6 BYO App first |
| **Per-stage credential profiles** | PAT map + App covers v1; schema complexity later |

---

## How to propose a change (for staff+)

Use this template in issues/PRs:

1. **Problem** — production evidence, not preference  
2. **Alternative** — at least one lighter option rejected  
3. **Semver** — patch/minor/major + contract doc update  
4. **Operations** — who runs it, secrets, failure modes  
5. **Test plan** — unit + act + example fixture  

Features touching **artifact names**, **validation codes**, or **skip semantics** default to **major** unless purely additive.

---

## What we optimize for (decision filter)

When prioritizing, maintainers rank:

1. **Cross-repo synchronous orchestration** (core promise)  
2. **Validate before run** (shift left)  
3. **Actions-native primitives** (no new servers)  
4. **Opt-in complexity** (flags over magic)  
5. **Immutable consumer pins** (action repos)

Ideas that score low on all five belong in this document, not the next release.

---

## What to read next

- [12 — Validation, simulate, and PR bot](12-validation-simulate-and-pr-bot.md)  
- [13 — Meta release pipeline](13-meta-release-pipeline.md)

## Series index

[README](README.md)
