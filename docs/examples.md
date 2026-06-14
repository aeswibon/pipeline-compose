# pipeline-compose — usage examples

Extended guide for the **run** action, pipeline YAML, and stage contracts.

- [README](../README.md) — usage and scenarios
- [docs/development.md](development.md) — this repository layout and local development

## Mental model

| Piece | Role |
|-------|------|
| **Pipeline YAML** | Order file — stages, `needs`, inputs |
| **Stage workflows** | Your existing workflows + `workflow_dispatch` |
| **Entry workflow** | Triggers on tag/PR/manual; one `run` step |

No generated workflow. No compile step.

---

## Example 1 — Tag release (this repo)

**Pipeline** — `.github/pipelines/pipeline.yml`

```yaml
name: pipeline
version: 1
stages:
  - id: version-sync
    workflow: .github/workflows/stage-version-sync.yml
    outputs:
      - version
      - skip_publish
  - id: release-publish
    workflow: .github/workflows/stage-release-publish.yml
    needs:
      - version-sync
    inputs:
      version: ${{ context.version-sync.version }}
      skip_publish: ${{ context.version-sync.skip_publish }}
```

**Entry** — `.github/workflows/pipeline.yml`

```yaml
on:
  push:
    tags: ["v*"]
jobs:
  run-pipeline:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      actions: write
    steps:
      - uses: actions/checkout@v6
      - uses: ./run
        with:
          pipeline_file: .github/pipelines/pipeline.yml
```

**On `git push origin v0.2.0`:** the run action dispatches `stage-version-sync.yml`, waits, then dispatches `stage-release-publish.yml` with outputs from the first stage.

---

## Example 2 — Stage with `workflow_dispatch`

Stages must be dispatchable. Dual `workflow_call` + `workflow_dispatch` is fine:

```yaml
name: Version sync
on:
  workflow_dispatch:
  workflow_call:
    outputs:
      version:
        value: ${{ jobs.version-sync.outputs.version }}

jobs:
  version-sync:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.out.outputs.version }}
    steps:
      - id: out
        run: echo "version=1.0.0" >> "$GITHUB_OUTPUT"
```

Downstream inputs use `workflow_dispatch` inputs when dispatched by `run`:

```yaml
on:
  workflow_dispatch:
    inputs:
      version:
        type: string
        required: true
  workflow_call:
    inputs:
      version:
        type: string
        required: true

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Release ${{ inputs.version }}"
```

### Export outputs artifact (required for `run`)

GitHub's REST API does not return job outputs for dispatched workflows. Upload:

- **Artifact name:** `pipeline-compose-<stage-id>`
- **File:** `outputs.json` with your output keys

```yaml
- name: Export outputs for pipeline-compose
  if: success()
  run: |
    mkdir -p pipeline-compose
    jq -n --arg version "$VERSION" '{version: $version}' > pipeline-compose/outputs.json
- uses: actions/upload-artifact@v4
  with:
    name: pipeline-compose-my-stage
    path: pipeline-compose/outputs.json
    retention-days: 1
```

---

## Example 3 — Context wiring

| Pipeline source | Resolved at runtime |
|-----------------|---------------------|
| `${{ context.version-sync.version }}` | Output from `version-sync` stage job |
| `${{ context.build.image_tag }}` | Output from `build` stage job |

---

## Example 4 — Conditional stage

```yaml
stages:
  - id: deploy
    workflow: .github/workflows/deploy.yml
    when: startsWith(github.ref, 'refs/tags/v')
```

Skipped stages are not dispatched.

---

## Example 5 — Repo layout

```text
.github/
  pipelines/
    pipeline.yml       # edit this (order only)
  workflows/
    release.yml        # entry: one run step (or use pipeline.yml)
    stage-sync.yml
    stage-build.yml
    ci.yml
templates/
  pipeline-run.yml     # copy-paste entry workflow
```

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `Workflow not found` | Wrong `workflow` path in pipeline YAML |
| `Could not find job outputs` | Stage job did not set outputs listed in pipeline `outputs:` |
| Stage fails immediately | Missing `workflow_dispatch` on stage workflow |
| `403` on dispatch | Missing `actions: write` on the entry job |
| Wrong ref in stage | Pass `ref:` to `run` or dispatch from the intended tag event |

---

## Optional: compile action

[`compile/`](../../compile/action.yml) emits a static reusable workflow for advanced users who want native GitHub `needs:` graphs and are OK committing generated YAML. Not required for normal use.

---

## Related

- [README](../README.md)
- [docs/development.md](development.md)
- [schema/pipeline-v1.schema.json](../schema/pipeline-v1.schema.json)