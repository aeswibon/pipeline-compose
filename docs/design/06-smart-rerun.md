# 06 — Smart rerun

**Series:** [Design rationale](README.md) · **Prev:** [05 — Monorepo and action repos](05-monorepo-and-action-repos.md) · **Next:** [07 — Sub-pipelines](07-sub-pipelines.md)

**Shipped:** v1.4.0 · **Flag:** `smart_rerun: true` on pipeline definition

## Executive summary

Smart rerun optimizes **GitHub’s “Re-run failed jobs” / new workflow attempt** path: skip re-dispatch when stage inputs are unchanged and prior outputs are still valid. It is **not** a general build cache—it is attempt-scoped memoization of the export contract.

---

## Context

### Pain on retry

Cross-repo release pipelines commonly run 30–90 minutes. Flaky stage 9 of 10 causes full retry →:

- Re-burns minutes in upstream repos
- Re-hits rate limits and deployment locks
- Encourages operators to run stages manually outside the pipeline (audit loss)

Native Actions re-runs **re-execute jobs** in the entry workflow; our orchestrator re-dispatches every stage unless told otherwise.

### What we refused to build (v1.4)

- Content-addressed build caching (Turbo/remote cache domain)
- Arbitrary “resume from stage X” UI
- Cross-run state in external database

---

## Decision

### Activation conditions

All must hold:

1. `smart_rerun: true` on resolved pipeline.
2. `GITHUB_RUN_ATTEMPT > 1`.
3. Previous attempt’s workflow run id discoverable via API.
4. Previous attempt uploaded `pipeline-compose-rerun-state` artifact.
5. Per stage: fingerprint match **and** all declared `outputs` present in saved state.

### Fingerprint inputs

`stageFingerprint` hashes (`packages/core/src/lib/smart-rerun.ts`):

- `id`, `workflow` or `pipeline_file`, `repo`, normalized `ref`, `when`, sorted `inputs` key/value map, optional **content digest** (`workflow_digest` in payload).

**Content digest (v1.9+ workflows, v1.11+ `pipeline_file`):** same-repo file hash via `workflowFileDigest`; cross-repo workflow and `pipeline_file` paths via Contents API.

### State artifact

| Field | Purpose |
|-------|---------|
| `version: 1` | Schema evolution hook |
| `stages[stageId].fingerprint` | Match gate |
| `stages[stageId].outputs` | Reused context values |
| `stages[stageId].runId` | Logging / future deep links |

Persisted after **each wave** when any stage completed (`persistRerunState` via `@actions/artifact`). Retention: **1 day** (`RETENTION_DAYS`).

Loaded from **previous attempt’s** workflow run via `findPreviousAttemptRunId` + artifact download.

### Sub-pipelines

Sub-pipeline stages store `runId: 0` and nested outputs flattened to parent declared keys. Fingerprint covers parent stage inputs to nested graph.

---

## Consequences

### Positive

- **CI dollar savings** on retry-heavy pipelines (documented value prop for enterprise).
- **No new infrastructure** — same artifact primitive as stage outputs.
- **Opt-in** — default false preserves v1.3 behavior.

### Negative / risks

| Risk | Mitigation |
|------|------------|
| Stale outputs after logic change | Bump input version; document in runbook |
| Artifact expired (>1 day) | Retry behaves like first attempt |
| Side-effect stages re-skipped | **Stages must be idempotent** or smart rerun disabled for mutating stages |
| Fingerprint collision (theoretical) | 16 hex chars truncated SHA-256; raise length if ever needed |

### Idempotency requirement (PE must-read)

Smart rerun assumes re-executing a stage would produce the **same outputs** for the same inputs. Deploy/publish stages with side effects should either:

- Not use smart rerun on that pipeline, or
- Include a monotonic `run_id` / `attempt` input in fingerprint so retries re-run mutators

---

## Alternatives considered

| Approach | Why not v1.4 |
|----------|--------------|
| **Actions cache API** | Cross-repo keying and eviction opaque |
| **Reuse by prior `run_id` only** | Inputs may have changed between attempts |
| **GitHub re-run only failed stages API** | Does not exist for dispatched child workflows as first-class |
| **Manual `skip:` expressions** | Author burden; smart rerun is convention over configuration |
| **Remote cache (Turbo)** | Different layer; see roadmap |

---

## Operations

| Log line | Meaning |
|----------|---------|
| `Smart rerun: reusing stage "X"` | Skipped dispatch; context from prior attempt |
| `no previous workflow attempt found` | Attempt 1 or API gap |
| `no pipeline-compose-rerun-state` | Prior attempt failed before any wave persisted state |

**Debugging stale reuse:** compare fingerprint inputs in logs; diff pipeline YAML inputs between attempts.

---

## Invariants

- Rerun state artifact name: `pipeline-compose-rerun-state` (constant `RERUN_STATE_ARTIFACT`).
- State file inside: `rerun-state.json`.
- `canReuseStage` requires every declared output key non-null in saved state.

---

## Revisit criteria

- Fingerprint includes **workflow blob hash** automatically (reduces stale reuse risk).
- Customers need **selective rerun** (“only stage 9”) without new attempt — needs new API/UI, not just artifact.
- Evidence of **collision or false reuse** in production → shorten trust window or add HMAC over outputs content.

---

## Code anchors

| Piece | Path |
|-------|------|
| Fingerprint + parse | `packages/core/src/lib/smart-rerun.ts` |
| Load/persist | `packages/action-run/src/smart-rerun.ts` |
| Orchestrator hook | `packages/action-run/src/orchestrator.ts` (`runOneStage`) |

---

## What to read next

- [03 — Context and export contract](03-context-and-export-contract.md)  
- [07 — Sub-pipelines](07-sub-pipelines.md)
