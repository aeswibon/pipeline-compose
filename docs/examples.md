# pipeline-compose — usage examples

Extended guide for the **run** action, pipeline YAML, and stage contracts.

- [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) — primary action usage
- [docs/development.md](development.md) — monorepo development

## Mental model

| Piece | Role |
|-------|------|
| **Pipeline YAML** | Order file — stages, `needs`, inputs |
| **Stage workflows** | Your existing workflows + `workflow_dispatch` |
| **Entry workflow** | Triggers on tag/PR/manual; one `run` step |

No generated workflow. No compile step.

---

## Example 1 — Tag release with the run action

Use this pattern in **your** repository. The [pipeline-compose](https://github.com/aeswibon/pipeline-compose) meta repo uses [`.github/workflows/release.yml`](../.github/workflows/release.yml) with native reusable workflows instead.

**Pipeline** — `.github/pipelines/pipeline.yml`

```yaml
version: 2
companion_workflows:
  - .github/workflows/release.yml
pipelines:
  release:
    stages:
      - id: ci
        workflow: .github/workflows/ci.yml
      - id: version-sync
        workflow: .github/workflows/stage-version-sync.yml
        needs:
          - ci
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

**Entry** — `.github/workflows/release-pipeline.yml` (or use [templates/pipeline-run.yml](../templates/pipeline-run.yml))

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
      - uses: aeswibon/pipeline-compose-run@v1.3.0
        with:
          pipeline_file: .github/pipelines/pipeline.yml
          github_token: ${{ github.token }}
```

**On `git push origin v0.2.0`:** the run action dispatches `ci.yml`, then `stage-version-sync.yml`, then `stage-release-publish.yml` with outputs from version sync.

### Release notes from the pipeline

Every tag release **requires** a matching section in `CHANGELOG.md` (Keep a Changelog format). The release workflow fails early if it is missing or empty.

`stage-version-sync.yml` runs `scripts/ci/require-changelog-section.sh`.  
`stage-release-publish.yml` runs `scripts/ci/render-release-notes.sh`, which:

1. Verifies the `## [X.Y.Z]` section exists
2. Uses that section as the release body
3. Appends GitHub's auto-generated commit summary below a `---` divider

Add the version section to `CHANGELOG.md` on master, commit, then tag and push.

```markdown
## [0.2.0] - 2026-06-15

### Added
- ...
```

Local check before tagging:

```bash
bash scripts/ci/require-changelog-section.sh 0.2.0
```

To pass custom notes through pipeline context instead, add a `release_notes` output from an earlier stage and a `release_notes` input on the publish stage, then write the input to a file and pass it to `gh release create --notes-file`.

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
- uses: aeswibon/pipeline-compose-export@v1.3.0
  if: success()
  with:
    stage_id: my-stage
    outputs: '{"version":"${{ steps.meta.outputs.version }}"}'
```

Manual upload with `jq` and `actions/upload-artifact` is equivalent if the artifact name is `pipeline-compose-<stage-id>` and the file is `outputs.json`.

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

[pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) emits a static reusable workflow for advanced users who want native GitHub `needs:` graphs and are OK committing generated YAML. Not required for normal use.

---

## Related

- [README](../README.md) — monorepo overview
- [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) — action usage
- [docs/development.md](development.md)
- [packages/core/schema/pipeline-v1.schema.json](../packages/core/schema/pipeline-v1.schema.json)