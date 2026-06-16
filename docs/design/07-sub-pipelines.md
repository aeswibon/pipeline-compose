# 07 — Sub-pipelines

**Series:** [Design rationale](README.md) · **Prev:** [06 — Smart rerun](06-smart-rerun.md) · **Next:** [08 — Stage catalog](08-stage-catalog.md)

**Shipped:** v1.4.0 · **Schema:** `pipeline_file` (+ optional `pipeline` key)

## Executive summary

Sub-pipelines let one **stage slot** execute an entire inner DAG **inline**, surfacing selected outputs on the parent stage id. Same runtime, same dispatch model—**composition without a second orchestrator product**.

---

## Context

### Composition problems in the wild

| Pattern | Pain |
|---------|------|
| Flat 15-stage top-level pipeline | Review noise; backend/frontend teams cannot own files |
| “Meta workflow” that only calls other workflows | Inner steps invisible to parent context; duplicate export glue |
| Multiple pipeline keys with `needs:` in one file | Works for **sibling** graphs, not “one box in the diagram” |

Release trains often want: `release → { backend-pipeline, frontend-pipeline }` where each subgraph has its own maintainers and file.

### v2 already has multi-pipeline maps

`pipelines:` with `needs:` between keys solves **peer** orchestration. Sub-pipelines solve **hierarchical** encapsulation: parent stage `id` is the context boundary for siblings.

---

## Decision

### Schema

Stage may set:

- `pipeline_file: path/to.yml` — must be schema v2.
- `pipeline: key` — required if file contains multiple pipeline keys; optional if exactly one.

**Mutually exclusive** with `workflow` on the same stage (validated).

### Runtime

`resolveSubPipeline` (`packages/core/src/compile/sub-pipeline.ts`):

1. Load file from `repoRoot`.
2. Select pipeline key; reject v1 documents.
3. **Validate nested stages:** no nested `pipeline_file`; every nested stage must have `workflow`.
4. Return `ResolvedPipeline` for recursive `runPipeline`.

Parent stage passes resolved `inputs` as `subPipelineInputs` to nested run. Nested results collected via `collectSubPipelineOutputs`:

- Flattens non-skipped nested stage outputs into one map.
- Parent `outputs:` list picks keys from that map (must exist or throw).

**Parent run id:** sub-pipeline does not create a separate GitHub workflow for the wrapper—only leaf `workflow` dispatches fire.

### One-level nesting cap

Enforced at **resolve** time:

```text
Sub-pipeline nesting is limited to one level
```

**Rationale:**

| Concern | Deep nesting impact |
|---------|---------------------|
| Validate/simulate | Exponential complexity in mermaid and error paths |
| Mental model | On-call cannot answer “which file owns this stage?” |
| API cost | Multiplicative dispatches under one parent slot |
| Smart rerun | Fingerprint semantics blur across levels |

**Upgrade paths (without unlimited nest):**

- Flatten with catalog `use:` templates ([08](08-stage-catalog.md))
- Split into peer pipelines with `needs:` between keys
- Run separate top-level entry workflows (true decoupling)

---

## Consequences

### Positive

- **Team ownership** — backend team owns `backend-pipeline.yml`; release file stays small.
- **Same context rules** — downstream still uses `context.parent-stage-id.key`.
- **Simulate** — can expand nested file for dry-run (with `repoRoot`).

### Negative

- **Debugging** — nested failures show inner stage id in logs but parent stage id in top-level context.
- **Output key collisions** — flatten uses last-wins across nested stages; declare unique output names or only export from designated leaf.
- **Cross-repo** — nested file resolved from **entry repo** `repoRoot`; nested stages can still set `repo:` per stage.

### vs peer `pipelines:` keys

| Use sub-pipeline when… | Use peer pipelines when… |
|------------------------|--------------------------|
| One stage box should hide inner DAG | Graph is flat at file level |
| Parent pipeline should not know inner stage ids | Consumers reference multiple top-level products |
| Release driver triggers “backend bundle” as one step | CI vs release are separate products with `needs:` |

---

## Alternatives considered

| Idea | Verdict |
|------|---------|
| **Unlimited nesting** | Rejected — see table above |
| **Sub-pipeline = dispatch separate entry workflow** | Extra run id; loses inline context merge |
| **Only workflow_call wrapper** | Same-repo; doesn't compose files as data |
| **Import YAML anchors** | No validation; breaks across files |

---

## Invariants

- Nested file must be `version: 2`.
- Nested stages: `workflow` only (no `pipeline_file`).
- Parent must declare `outputs:` for keys promoted to parent context.

---

## Revisit criteria

- Customers show **two-level** insufficient but **three+** rare — consider configurable max depth (default 1) instead of hard error.
- Output collision causes production bugs — add namespacing `nestedStageId.key` in flatten (breaking change).

---

## Code anchors

| Piece | Path |
|-------|------|
| Resolve + validate nest | `packages/core/src/compile/sub-pipeline.ts` |
| Output collect | `collectSubPipelineOutputs` same file |
| Runtime recurse | `packages/action-run/src/orchestrator.ts` (`pipeline_file` branch) |

---

## What to read next

- [08 — Stage catalog](08-stage-catalog.md)  
- [02 — Orchestration model](02-orchestration-model.md)
