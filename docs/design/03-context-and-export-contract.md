# 03 — Context and export contract

**Series:** [Design rationale](README.md) · **Prev:** [02 — Orchestration model](02-orchestration-model.md) · **Next:** [04 — Run path vs compile path](04-run-path-vs-compile-path.md)

## Executive summary

Cross-run data plane is **artifacts**, not job `outputs`, because GitHub’s API model does not give orchestrators a supported way to read arbitrary dispatched workflow job outputs. We standardized the artifact shape and added **defense-in-depth validation** so wiring errors fail in PR CI, not at 2am on a release tag.

---

## Context

### The API gap

In a **single** workflow run, job `outputs` are the correct mechanism: typed, documented, no upload step.

In **pipeline-compose**, each stage is a **different** run. The orchestrator must answer: “what did stage `version-sync` produce?”

GitHub documents job outputs for workflows you trigger from the same run. For workflows started via `workflow_dispatch` from an external orchestrator, the reliable pattern used in the wild is:

1. Stage uploads an artifact.
2. Orchestrator downloads artifact after run completes.

We verified job listing + outputs as a **best-effort fast path** (`outputsFromJobs` in orchestrator) but do not depend on it for correctness when `outputs:` is declared.

### Why strings everywhere

`workflow_dispatch` inputs are stringly-typed at the API boundary. Context is `Record<stageId, Record<key, string>>`. Even numeric versions flow as strings—matches Actions expression behavior and avoids JSON type coercion surprises in YAML.

---

## Decision

### Contract (frozen in [1.0 contracts](../specs/1.0-contracts.md))

| Layer | Responsibility |
|-------|----------------|
| Pipeline `outputs: [keys]` | Declares **which keys** exist for downstream `context.stage.key` |
| Stage workflow | Produces values (steps → `GITHUB_OUTPUT` → export input) |
| **pipeline-compose-export** | Writes `outputs.json`, uploads `pipeline-compose-<stage_id>` |
| Run action | Downloads artifact; merges into in-memory context |
| Validate (v1.3+) | `context.unknown-stage`, `context.unknown-output` on bad wiring |
| `context_schema` (optional) | JSON Schema paths for outputs/refs ([09](09-typed-context-schema.md)) |

### Collection order at runtime

```text
collectStageOutputs()
  1. listRunJobs → outputsFromJobs (ponytail: last successful job wins)
  2. else waitForStageArtifact → outputs.json
  3. else throw with expected keys
```

**Why try job outputs first?** Same-repo stages that set job-level outputs on a single-job workflow can work without export—convenience for simple graphs. **Why not rely on it?** Multi-job workflows, cross-repo, and GitHub API inconsistency make artifacts the portable truth.

**ponytail ceiling:** `outputsFromJobs` scans jobs reverse order, first success with all declared keys. Upgrade: convention `job: <stage-id>` or explicit job name in pipeline YAML.

### Export action scope

Export is deliberately dumb: validate JSON object, write file, upload artifact. No orchestration, no network besides artifact API.

**Rationale:** smallest action surface for security review; stage authors control what enters `outputs` JSON (including secret redaction in their workflow).

---

## Defense in depth (validation layers)

| Layer | Catches |
|-------|---------|
| JSON schema on pipeline file | Malformed YAML shape |
| `context.unknown-*` | Typos in `context.foo.bar` refs |
| `context_schema` | Contract drift vs documented types/paths |
| `export.missing` warning | Stage declares outputs but workflow scan sees no export step |
| Runtime `missingRequiredContext` | Upstream skipped or forgot to export |
| Runtime throw on incomplete artifact | Keys declared but absent in `outputs.json` |

**PE point:** we bias failures **left** (merge) because cross-repo stages often do not execute on every PR.

---

## Consequences

### Positive

- **Repo-local stage workflows** remain testable in isolation (`workflow_dispatch` manually).
- **Explicit data plane** — artifact names are grep-able in logs and support.
- **Smart rerun** can reuse prior `outputs` without re-dispatch ([06](06-smart-rerun.md)).

### Negative

- **Authoring friction** — two places (`outputs:` list + export JSON) must stay aligned.
- **Retention** — artifacts expire per repo settings; rerun across long gaps may miss prior attempt artifact.
- **No large binary context** — artifacts are for metadata (versions, flags, URLs), not build artifacts. Pass IDs/URLs, not images.

### Security

- Context flows through logs as resolved dispatch inputs—**do not export secrets** to context consumed by less-trusted repos.
- Cross-repo stages imply **trust boundary**: downstream repo sees whatever upstream exported.

---

## Alternatives considered

| Approach | Assessment |
|----------|------------|
| **Commit to repo branch** | Write amplification, merge races, needs `contents: write` on bot |
| **GitHub Environments / variables** | Global, not DAG-shaped; poor ergonomics for N stages |
| **Cache API** | Opaque eviction; awkward cross-repo keys |
| **External KV (Redis, S3)** | New system to secure, monitor, and pay for |
| **workflow_call with outputs** | Same-repo only; does not solve library → consumer |
| **Require export only (drop job output probe)** | Simpler docs; rejected to ease same-repo migration |

---

## Operations playbook

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Empty downstream input | Export `stage_id` typo or step skipped (`if: success()`) | Align ids; ensure export runs |
| `Could not find outputs` | Missing keys in `outputs.json` vs pipeline `outputs:` | Add keys or trim declaration |
| Intermittent on multi-job workflow | Job output probe picked wrong job | Add export step (canonical) |
| Cross-repo empty context | Artifact not visible to token | Same repo only for artifacts today—stage and orchestrator must share repo **or** export happens in dispatched repo and orchestrator reads that run (it does, via stage’s run id) |

---

## Invariants

- Artifact name: `pipeline-compose-<stage_id>` (exact).
- File name inside: `outputs.json` (object, string values).
- Context key path: `context.<stage_id>.<output_key>` in expressions.

Breaking these requires a **semver major**.

---

## Revisit criteria

- GitHub documents stable **“get outputs from workflow run X”** REST/GraphQL used by Actions team for dispatch callers.
- Customers need **structured typed context** (numbers/objects) at runtime — would need schema + export v2 and major bump.

---

## What to read next

- [06 — Smart rerun](06-smart-rerun.md) — reuses exported output map  
- [09 — Typed context schema](09-typed-context-schema.md) — static contract checks  
- [pipeline-compose-export README](https://github.com/aeswibon/pipeline-compose-export)
