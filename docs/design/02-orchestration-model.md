# 02 — Orchestration model

**Series:** [Design rationale](README.md) · **Prev:** [01 — Problem and approach](01-problem-and-approach.md) · **Next:** [03 — Context and export contract](03-context-and-export-contract.md)

## Executive summary

The run action implements a **deterministic DAG scheduler** in one Node process: topological waves, parallel dispatch within a wave, synchronous wait per stage, immutable context merge. Stages are **separate workflow runs** on purpose—that is how GitHub models cross-repo work.

---

## Context

### Why not embed stages as jobs in the entry workflow?

| Job-in-one-workflow | Dispatch-per-stage |
|---------------------|-------------------|
| Single `GITHUB_RUN_ID` | One run ID per stage (traceable per team) |
| `needs:` native | API polling required |
| Same `GITHUB_TOKEN` scope | Per-repo token/client |
| Hard to trigger existing workflows unchanged | Reuses workflows teams already run manually |

We chose dispatch because the product promise includes **“keep your workflows”** and **cross-repo** without regenerating a mega-workflow on every repo change.

### Scheduler requirements

1. Respect `needs:` (DAG), detect cycles at validate time.
2. Run independent stages in parallel (v1.2+) to avoid artificial wall-clock serialization.
3. Honor `when:` without dispatching (cost + clarity).
4. Propagate failure: one failed stage aborts the pipeline (no “best effort” continue).
5. Mirror skip semantics in `validate --simulate` for PR confidence.

---

## Decision

### Control flow

```text
runPipeline()
  enforcePipelineConcurrency()     # optional; see below
  waves = groupStagesIntoWaves() # packages/core/src/compile/stage-waves.ts
  for each wave:
    Promise.all(wave.map(runOneStage))
    merge context from non-skipped results
    persist smart-rerun state artifact (if enabled)
```

`groupStagesIntoWaves` is a classic “ready set” topological sweep: a stage enters the current wave when all `needs` are in `completed`. Unresolved pending set → error (cycle or unknown dep).

### Per-stage algorithm (`runOneStage`)

Order of checks (matches simulate):

1. **Skipped upstream** — if any `needs` stage was skipped, this stage is **blocked/skipped** (not failed).
2. **`when:` false** — skip without dispatch.
3. **Missing context** — if `inputs` reference `context.X.Y` and key absent → **throw** (hard fail). Prevents silent empty strings to downstream APIs.
4. **Sub-pipeline** — if `pipeline_file`, recursive `runPipeline` (see [07](07-sub-pipelines.md)).
5. **Smart rerun** — reuse prior attempt outputs if fingerprint matches ([06](06-smart-rerun.md)).
6. **Dispatch** — `getWorkflowByPath` → `dispatchWorkflow` → `waitForRun` (created after dispatch timestamp) → `waitForRunCompletion`.
7. **Collect outputs** — job outputs API first, then artifact ([03](03-context-and-export-contract.md)).

### Parallelism model

Stages in the same wave run under `Promise.all`. Shared mutable state:

- `state.context` — updated **after** the wave completes (not during). No race on context within a wave.
- `state.skipped` — stages that skip in a wave are recorded before next wave.

**Implication:** two stages in the same wave **must not** depend on each other’s outputs. That is the same invariant as GitHub job parallelism.

### Cross-repo client selection

`clientForStage`:

1. No `repo:` → default `GITHUB_TOKEN` client.
2. `repo:` matches entry repo → default client (avoid redundant token).
3. Else `resolveStageToken` from `repo_tokens_json`, or **fallback** to `GitHubAppTokenProvider` if PAT missing.
4. Cache `GitHubActionsClient` per `owner/repo#tokenPrefix`.

This keeps token scope **minimal per target** and avoids re-authenticating every poll.

### Concurrency enforcement

Pipeline-level `concurrency` is **not** only codegenned for compile path. Run path calls `enforcePipelineConcurrency` before waves:

- Lists in-progress/queued runs of the **same entry workflow** on the same ref.
- `cancel_in_progress: true` → cancel conflicts; else wait until clear or timeout (max 5 min cap for wait loop).

**Why poll the entry workflow, not each stage?** Concurrency is a property of “how many release pipelines at once,” typically declared on the entry workflow. Native Actions `concurrency:` block applies to the workflow file; we emulate the wait/cancel half for run-only adopters who set `concurrency` in pipeline YAML.

**ponytail:** ref matching for tags uses heuristics (`head_branch == null` for tag runs). Edge cases exist for unusual ref shapes.

---

## Skip vs fail semantics (subtle, important)

| Outcome | Pipeline continues? | Downstream with `needs: [that]` |
|---------|---------------------|----------------------------------|
| Stage run **fails** | No — orchestrator throws | Not started |
| `when:` **skip** | Yes | Treated as skipped → dependents **blocked** |
| Upstream **skipped** | Yes | Dependent **blocked** |

This mirrors “skipped job” behavior in Actions: dependents do not run unless `needs` semantics allow optional deps (we do **not** support `needs: optional` yet—only hard `needs`).

Simulate labels: `run` | `skip` | `blocked` with reasons — use in PR review.

---

## Operational implications

### Runner occupancy

The orchestrator job runs for **entire pipeline wall time**. For a 45-minute release graph, that job is occupied 45 minutes. Stages still use their own runners.

**Cost mental model:** 1 orchestrator runner + sum(stage runners). Smart rerun reduces **stage** cost on retry, not orchestrator polling time.

### API rate limits

Polling uses configurable `pollMs` (default 10s). Cross-repo multiplies clients but not necessarily poll endpoints if stages serialize in later waves.

**Failure mode:** GitHub API 403/429 → stage fails → pipeline fails. No infinite retry loop in core (operators can re-run workflow).

### Timeouts

Default stage wait: 1 hour (`timeoutMs`). Operators with long E2E must raise timeout via action inputs.

### Observability

Each stage has its own workflow run URL in logs. There is **no** single Actions UI graph across repos—tradeoff for dispatch model. Mermaid from validate is the static graph; simulate table is the dynamic dry-run.

---

## Invariants (semver-sensitive)

- Stage `id` is stable key for context, artifacts, and rerun state.
- Wave grouping algorithm matches between validate simulate and runtime.
- Failed stage → pipeline failure (no partial success flag on run action today).

---

## Alternatives considered

| Approach | Why rejected |
|----------|--------------|
| **Matrix job spawning all stages** | Cannot cross repos; cannot call existing workflow files as-is |
| **GitHub Checks API only** | Does not wait or merge outputs into inputs |
| **Event-driven (webhook) resume** | Requires always-on receiver; harder for self-hosted/GitHub.com parity |
| **Queue between stages (SQS, etc.)** | New infra + secrets; artifacts already work |
| **Optimistic continue on failure** | Violates “one pipeline result”; opt-in partial pipelines deferred |

---

## Revisit criteria

- GitHub exposes **workflow run subscription/webhook** with official “wait for run” in composite actions without polling.
- Customers need **partial pipeline success** (e.g. deploy optional smoke) as first-class — would need schema + result model change.
- Parallel wave fan-out causes **rate limit storms** at scale — may need adaptive backoff or batching layer.

---

## Code anchors

| Concern | Location |
|---------|----------|
| Wave grouping | `packages/core/src/compile/stage-waves.ts` |
| Orchestrator loop | `packages/action-run/src/orchestrator.ts` |
| Simulate parity | `packages/core/src/compile/simulate.ts` |
| Concurrency wait | `packages/action-run/src/concurrency-enforce.ts` |

---

## What to read next

- [03 — Context and export contract](03-context-and-export-contract.md)  
- [06 — Smart rerun](06-smart-rerun.md)  
- [10 — Cross-repo authentication](10-cross-repo-authentication.md)
