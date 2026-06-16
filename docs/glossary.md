# pipeline-compose glossary

Combined reference for **monorepo contributors** and CLI work. **Action users:** each published action README includes a **Glossary** section with only the terms relevant to that action — start there instead of this file.

## Core concepts

### Pipeline file

YAML under `.github/pipelines/` that declares **order and wiring only**. Stage implementations stay in normal workflow files (`.github/workflows/*.yml`).

| Format | Top-level shape |
|--------|-----------------|
| **v2** (required since 1.0) | `version: 2`, `pipelines:` map (one file, multiple logical pipelines) |
| ~~v1~~ | Removed in 1.0 — see [migration/v1.0.md](migration/v1.0.md) |

Schema: [pipeline-v2.schema.json](../packages/core/schema/pipeline-v2.schema.json) · [pipeline-v1.schema.json](../packages/core/schema/pipeline-v1.schema.json) (historical)

### Stage

One ordered step in the pipeline. Each stage points at a **workflow file** and an **`id`**. The run action dispatches that workflow via `workflow_dispatch`, waits for it to finish, and optionally reads its outputs into **`context`**.

### Entry workflow

A normal GitHub workflow (e.g. `.github/workflows/release.yml`) that **starts** the pipeline — typically one job with `pipeline-compose-run`. It is **not** a stage; it triggers on `push: tags:` (or similar) and hands off to the pipeline file.

### Orchestrator

**pipeline-compose-run** — reads the pipeline file, evaluates `when:`, dispatches stages in order, merges outputs into `context`, and fails the job if a stage fails.

### Concurrency

| Concern | Behavior |
|---------|----------|
| **Overlapping runs** | Optional `concurrency` on pipeline YAML — run action cancels or waits for other in-progress runs of the same entry workflow on the same ref |
| **Parallel stages** (siblings in the DAG) | **Run:** same-wave concurrent dispatch. **Compile:** native GitHub `needs:` |
| **Smart rerun** | Optional `smart_rerun: true` — on workflow re-run, skip dispatch for stages whose inputs match the previous attempt |

---


## Pipeline fields

### `stages` / `pipelines`

- **v2:** `pipelines.<name>.stages` — each named pipeline has its own stage list. Cross-pipeline order uses pipeline-level **`needs`**.

### `id` (stage)

Unique stage identifier within the merged pipeline graph. Used in:

- stage `needs:` (dependencies)
- `context.<id>.<output>` in downstream `inputs` and `when:`
- artifact name `pipeline-compose-<id>`

### `workflow` (stage)

Path to the workflow file **in the repo** (or target repo when `repo:` is set). That file must include **`workflow_dispatch`** (and matching `inputs` if the pipeline passes inputs).

### `needs` (stage)

Prior **stage ids** that must complete before this stage runs. Defines the DAG inside one pipeline.

### `needs` (pipeline)

**v1 multi-file / v2 only** — other pipeline **names** that must complete before this pipeline’s stages run. Controls order between pipeline documents or v2 pipeline keys — not the same as stage `needs`.

### `group` / `groups`

Organizational label for stages and workflow sync conventions (`workflows/{group}/…`). Inherited from pipeline `group` or stage override. Used by **`validate --workflows`** for path naming hints — **not** a substitute for `needs`.

### `inputs` (stage)

Key/value map sent to the stage workflow’s **`workflow_dispatch` inputs**. Values may reference **`${{ context.<stage>.<key> }}`** from earlier stages.

### `outputs` (stage)

List of output **keys** the stage promises to export. The run action reads these from the stage’s **`outputs.json`** artifact (see [Stage export contract](#stage-export-contract)). Declare keys here so validate can reason about wiring and so downstream `context` is documented.

### `when` (stage)

Optional expression. If false, the stage is **skipped** (not dispatched), and stages that `needs:` it are skipped transitively. Evaluated by the run action (same language as **pipeline-compose-eval**).

### `repo` (stage)

Optional `owner/repo` slug. Dispatch runs in that repository instead of the default repo. Requires a token with `actions: write` on the target — use **`repo_tokens_json`** on the run action for cross-repo PATs.

### `companion_workflows`

**Optional.** List of workflow file paths that are **intentional** but **not** pipeline stages.

**Why it exists:** With `validate --workflows --strict`, any file in `.github/workflows/` that is not a stage `workflow` and not listed here is reported as **`workflow.orphan`** (error in strict mode).

**Typical companions:**

| Workflow | Why not a stage? |
|----------|------------------|
| `release.yml` | Entry trigger — runs `pipeline-compose-run`, not dispatched *as* a stage |
| PR comment / smoke workflows | Side tooling, not part of the release DAG |

| Format | Where to define |
|--------|-----------------|
| **v1** | Top level next to `name` and `stages` |
| **v2** | Top level next to `version` and `pipelines` |

Does **not** run or order those workflows — only suppresses false orphan warnings.

### `context`

Runtime JSON object built by the orchestrator: `{ "<stage-id>": { "<output-key>": "<value>", ... }, ... }`. Referenced in stage `inputs` and `when:` as `context.<stage-id>.<key>`.

---

## Stage export contract

GitHub does not expose job outputs for completed **`workflow_dispatch`** runs the way it does for jobs in the same workflow. pipeline-compose uses **artifacts** instead.

| Requirement | Value |
|-------------|--------|
| Artifact name | `pipeline-compose-<stage-id>` (must match stage `id`) |
| File in artifact | `outputs.json` — JSON object whose keys match pipeline `outputs:` |

**Why you define `outputs:` in the pipeline:** documents the contract and enables validation. **Why you upload an artifact in the stage workflow:** the run action has no other way to read cross-run outputs.

Use **pipeline-compose-export** in the stage workflow to create the artifact in one step, or upload manually / with `jq` (see run action README).

---

## Validation

### `validate --workflows`

Checks that stage workflow paths exist and optionally lists **orphan** workflows under `.github/workflows/`.

### `validate --strict`

Promotes warnings (orphans, group path hints, missing cross-repo tokens) to **errors** — typical in CI.

### `workflow.orphan`

A workflow file is not referenced by any stage `workflow` or **`companion_workflows`**. Fix by adding a stage, deleting the file, or listing it as a companion.

---

## Actions (which one when)

| Action | Use when |
|--------|----------|
| **[pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run)** | You want ordered multi-workflow execution with context — the main orchestrator |
| **[pipeline-compose-export](https://github.com/aeswibon/pipeline-compose-export)** | A stage workflow must export `outputs.json` for the run action |
| **[pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile)** | You prefer a **committed** generated workflow with native GitHub `needs:` |
| **[pipeline-compose-eval](https://github.com/aeswibon/pipeline-compose-eval)** | You need `when:`-style expressions **inside** a normal workflow (not via run) |
| **[pipeline-compose-context-merge](https://github.com/aeswibon/pipeline-compose-context-merge)** | You build context manually in a composite workflow without the run action |

---

## CLI helpers

| Command | Purpose |
|---------|---------|
| `pipeline-compose init` | Scan `.github/workflows/` and draft a starter pipeline |
| `pipeline-compose validate --mermaid` | Print stage DAG as Mermaid |
| `pipeline-compose sync` | Sync `workflows/{group}/` sources into flat workflow paths |

---

## Further reading

- [Tag release tutorial](tutorials/tag-release-pipeline.md)
- [Cross-repo tutorial](tutorials/cross-repo-pipeline.md)
- [Examples](../examples/)
