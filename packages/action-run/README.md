# pipeline-compose-run

**Run your GitHub workflows in a fixed order** — from one small pipeline file, without one giant workflow or fragile `workflow_run` chains.

Part of [pipeline-compose](https://github.com/aeswibon/pipeline-compose).

---

## Do I need this?

**Yes, if** you have **multiple workflow files** (CI, deploy, release, …) and you care about **which runs first** and **passing values** (version, flags) from one run to the next — especially across repos.

**No, if** a single `.github/workflows/ci.yml` with normal job **`needs:`** is enough.

| You have… | Use |
|-----------|-----|
| 3+ workflows that should run in sequence on tag push | **run** + pipeline file |
| One repo, one workflow, a few jobs | Native GitHub **`needs:`** |
| Want generated YAML committed to git | [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) instead |

You do **not** need compile, eval, or context-merge to get started. You **do** need [pipeline-compose-export](https://github.com/aeswibon/pipeline-compose-export) in any stage that passes data downstream (unless you upload the artifact manually).

---

## How it works (mental model)

Think of **two layers**:

```text
1. Entry workflow (e.g. release.yml)
   └── one job that runs THIS action once

2. Pipeline file (.github/pipelines/pipeline.yml)
   └── list of STAGES = existing workflow files + order + wiring
```

On each run, this action:

1. Reads the pipeline file  
2. For each stage (in **`needs`** order): optionally evaluates **`when:`**  
3. **Dispatches** that stage’s workflow (`workflow_dispatch`)  
4. **Waits** until it finishes  
5. Downloads **`outputs.json`** from the stage artifact → adds to **`context`**  
6. Passes **`context`** into the next stage’s **`inputs`**

```text
release.yml  →  run action  →  dispatch ci.yml
                              →  wait ✓
                              →  dispatch version-sync.yml  (gets version from context)
                              →  wait ✓
                              →  …
```

Your existing workflow **files** stay separate. The pipeline file only answers: *what order* and *what connects to what*.

---

## Concurrency

Two different ideas — both are supported.

### Overlapping pipeline runs (e.g. two tag pushes)

Add **`concurrency`** to your pipeline file (v2 root or v1 document):

```yaml
version: 2
concurrency:
  group: release-${{ github.ref }}
  cancel_in_progress: true   # cancel older runs; false = wait
pipelines:
  release:
    stages: [...]
```

**pipeline-compose-run** enforces this before dispatching stages: it finds other in-progress runs of the **same entry workflow** on the **same ref** and either cancels them (`cancel_in_progress: true`) or waits until they finish.

You can also add `concurrency` on the entry workflow (belt-and-suspenders); values should match.

### Parallel stages (siblings with no `needs` between them)

**Run action: parallel by wave.** Stages whose `needs` are all satisfied run **concurrently** (same DAG level). The next wave starts only after the current wave finishes.

**Compile action: parallel when GitHub can.** [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) emits native `needs:` jobs; GitHub runs independent jobs in parallel.

| Path | Parallel sibling stages | Overlapping runs |
|------|-------------------------|------------------|
| **run** (dispatch) | Yes — same wave dispatches together | `concurrency` in pipeline YAML |
| **compile** (generated YAML) | Yes — native GHA DAG | `concurrency` in pipeline YAML → generated workflow |

### Smart rerun (failed workflow re-run)

When a pipeline run fails partway through, GitHub’s **Re-run failed jobs** starts a new attempt (`GITHUB_RUN_ATTEMPT` > 1). With **`smart_rerun: true`** on the pipeline file:

```yaml
version: 2
smart_rerun: true
pipelines:
  release:
    stages: [...]
```

The run action saves a **`pipeline-compose-rerun-state`** artifact after each wave. On re-run, stages whose fingerprint (workflow, ref, resolved inputs, `when`) matches the previous attempt reuse cached outputs instead of dispatching again.

Stages with changed inputs or missing prior outputs still dispatch normally.

### Sub-pipelines

A stage can run another pipeline file inline instead of a single workflow:

```yaml
- id: full-ci
  pipeline_file: .github/pipelines/pr.yml
  pipeline: pr
  outputs:
    - snapshot_tag
```

The nested pipeline runs inside the parent stage. Declared `outputs` on the parent stage are collected from nested stage results. **ponytail:** nesting is limited to **one level** (no `pipeline_file` inside a nested pipeline).

Parent stage `inputs` are forwarded to every nested stage dispatch (nested stage inputs win on conflict).

### Typed context (`context_schema`)

Declare expected context shapes per pipeline:

```yaml
pipelines:
  release:
    context_schema:
      type: object
      properties:
        version-sync:
          type: object
          properties:
            version: { type: string }
    stages: [...]
```

`pipeline-compose validate` checks that declared stage `outputs` and `context.*` input references match paths in the schema.

---

## First-time setup checklist

Copy this list when adding pipeline-compose to a repo:

- [ ] Create **`.github/pipelines/pipeline.yml`** (order + stage ids)  
- [ ] Create **entry workflow** (e.g. `release.yml`) with **one step**: this action  
- [ ] Every stage workflow has **`workflow_dispatch:`** in `on:`  
- [ ] Stage workflow **`inputs:`** match pipeline **`inputs:`** (names and types)  
- [ ] Stages that pass data declare **`outputs:`** in the pipeline  
- [ ] Those stages end with **[pipeline-compose-export](https://github.com/aeswibon/pipeline-compose-export)** (or equivalent artifact upload)  
- [ ] List entry workflow under **`companion_workflows`** if you use strict validate  
- [ ] Entry job has **`permissions: actions: write`** (and `contents: write` if stages need it)

---

## Quick start — tag release

### Step 1 — Entry workflow

This file **starts** the pipeline. It is **not** a stage.

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ["v*"]

permissions:
  contents: write
  actions: write   # required — run dispatches other workflows

jobs:
  run-pipeline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: aeswibon/pipeline-compose-run@v1.5.0
        with:
          pipeline_file: .github/pipelines/pipeline.yml
          github_token: ${{ github.token }}
```

### Step 2 — Pipeline file (v2)

```yaml
# .github/pipelines/pipeline.yml
version: 2
companion_workflows:
  - .github/workflows/release.yml   # not a stage — avoids "orphan workflow" in validate
pipelines:
  release:
    stages:
      - id: ci
        workflow: .github/workflows/ci.yml

      - id: version-sync
        workflow: .github/workflows/stage-version-sync.yml
        needs: [ci]
        outputs: [version, skip_publish]

      - id: release-publish
        workflow: .github/workflows/stage-release-publish.yml
        needs: [version-sync]
        inputs:
          version: ${{ context.version-sync.version }}
          skip_publish: ${{ context.version-sync.skip_publish }}
```

### Step 3 — Stage workflow example

```yaml
# .github/workflows/stage-version-sync.yml
name: Version sync
on:
  workflow_dispatch:   # required — run triggers stages this way

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - id: meta
        run: |
          echo "version=1.2.3" >> "$GITHUB_OUTPUT"
          echo "skip_publish=false" >> "$GITHUB_OUTPUT"
      - uses: aeswibon/pipeline-compose-export@v1.5.0
        if: success()
        with:
          stage_id: version-sync          # must match pipeline id
          outputs: >-
            {"version":"${{ steps.meta.outputs.version }}",
             "skip_publish":"${{ steps.meta.outputs.skip_publish }}"}
```

Full copy-paste example: [run-tag-release](https://github.com/aeswibon/pipeline-compose/tree/master/examples/run-tag-release).

<!-- start usage -->
```yaml
- uses: aeswibon/pipeline-compose-run@v1.5.0
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    github_token: ${{ github.token }}
```
<!-- end usage -->

---

## Glossary

| Term | Plain English |
|------|----------------|
| **Pipeline file** | Short YAML: stage names, order, who gets which inputs. Not your job scripts. |
| **Stage** | One existing workflow file run as one step in the pipeline. |
| **Entry workflow** | The workflow that runs **this action** (e.g. on tag push). Not listed as a stage. |
| **`companion_workflows`** | Other workflow files you keep on purpose but don’t run as stages (entry, PR bots). Stops false “unused workflow” warnings. |
| **`id`** | Stage name you choose. Use the same string in export **`stage_id`**. |
| **`workflow`** | Path to the stage’s `.yml` file. |
| **`needs`** | “Run B only after A finished successfully.” |
| **`outputs`** | Keys this stage will send forward (e.g. `version`). |
| **`inputs`** | Values sent into the stage’s `workflow_dispatch`. Use **`${{ context.other-stage.key }}`**. |
| **`context`** | Memory of all prior stages’ outputs. Built automatically by this action. |
| **`when`** | Optional condition. If false, stage is skipped (and stages that depend on it skip too). |
| **`repo`** | Run this stage in another GitHub repo (`owner/name`). Needs either `repo_tokens_json` PAT mapping or GitHub App credentials. |
| **Export artifact** | Each stage with **`outputs`** must upload artifact **`pipeline-compose-<id>`** with file **`outputs.json`**. Use **export** action. |

---

## Common questions

**Why can’t I use normal job `outputs` between workflows?**  
GitHub only exposes **`outputs`** between jobs **in the same workflow run**. Each stage is a **separate** dispatch, so we use a small artifact instead.

**Why does every stage need `workflow_dispatch`?**  
This action starts stages by calling the Actions API — same as clicking “Run workflow” manually.

**What if a stage fails?**  
The pipeline stops. This job fails. Later stages don’t run.

**Do I need `companion_workflows`?**  
Only if you run strict validation and have workflows that aren’t stages (like `release.yml`). Safe to add; it doesn’t change runtime behavior.

**v1 or v2 pipeline?**  
**v2** = one file, `pipelines:` map (good for one repo). **v1** = `name` + `stages` (good for one pipeline per file in a folder).

**Cross-repo?** Add **`repo: org/repo`** on the stage and configure either **`repo_tokens_json`** or **`github_app_id` + `github_app_private_key`** on this action. See [export README](https://github.com/aeswibon/pipeline-compose-export) for same-repo setup first.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Resource not accessible by integration` | Missing **`actions: write`** | Add to entry workflow **`permissions`** |
| Stage never receives `version` / inputs empty | No export artifact or wrong **`stage_id`** | Add **export**; **`stage_id`** = pipeline **`id`** |
| `workflow_dispatch` not found | Stage YAML missing trigger | Add **`on: workflow_dispatch:`** |
| Pipeline skips a stage | **`when:`** evaluated false | Check expression / **`context`** keys |
| Strict validate: orphan workflow | Entry workflow not listed | Add to **`companion_workflows`** |
| Cross-repo 403 | Token can’t dispatch target repo | Add `repo_tokens_json` PAT mapping or GitHub App installed on target with workflow permissions |

### Cross-repo stages

When a stage sets `repo: other-org/other-repo`, pass tokens GitHub Actions resolves from secrets:

```yaml
- uses: aeswibon/pipeline-compose-run@v1.5.0
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    github_token: ${{ github.token }}
    repo_tokens_json: >
      {"other-org/other-repo":"${{ secrets.REMOTE_DISPATCH_TOKEN }}"}
```

Tutorial: [docs/tutorials/cross-repo-pipeline.md](https://github.com/aeswibon/pipeline-compose/blob/master/docs/tutorials/cross-repo-pipeline.md)

Using a GitHub App instead of PAT map:

```yaml
- uses: aeswibon/pipeline-compose-run@v1.5.0
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    github_token: ${{ github.token }}
    github_app_id: ${{ secrets.PIPELINE_APP_ID }}
    github_app_private_key: ${{ secrets.PIPELINE_APP_PRIVATE_KEY }}
```

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `pipeline_file` | file **or** dir | — | Path to pipeline YAML |
| `pipeline_dir` | file **or** dir | — | Folder of v1 pipeline files |
| `ref` | no | current ref | Git ref for dispatches |
| `github_token` | no | `github.token` | Needs **`actions: write`** |
| `repo_tokens_json` | no | `{}` | `{"owner/repo":"PAT"}` for **`repo:`** stages |
| `github_app_id` | no | — | GitHub App ID for cross-repo dispatch token minting |
| `github_app_private_key` | no | — | GitHub App private key PEM (supports escaped `\n`) |

## Outputs

| Output | Description |
|--------|-------------|
| `results_json` | JSON list of each stage: id, run id, outputs, skipped |

---

## Related actions

| Action | When |
|--------|------|
| [export](https://github.com/aeswibon/pipeline-compose-export) | **Required** for stages with **`outputs`** |
| [compile](https://github.com/aeswibon/pipeline-compose-compile) | Alternative: generate static workflow |
| [eval](https://github.com/aeswibon/pipeline-compose-eval) | Test **`when:`** expressions in isolation |
| [context-merge](https://github.com/aeswibon/pipeline-compose-context-merge) | Manual JSON file; not used with run |

## License

[MIT](LICENSE)
