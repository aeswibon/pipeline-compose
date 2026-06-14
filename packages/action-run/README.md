# pipeline-compose-run

Run GitHub Actions workflows **in order** from a pipeline YAML file. Dispatches each stage via `workflow_dispatch`, waits for completion, and passes outputs to later stages.

Part of [pipeline-compose](https://github.com/aeswibon/pipeline-compose).

<!-- start usage -->
```yaml
- uses: aeswibon/pipeline-compose-run@v0.3.0
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    github_token: ${{ github.token }}
```
<!-- end usage -->

## Usage

### Tag / release pipeline

```yaml
name: Release
on:
  push:
    tags: ["v*"]

permissions:
  contents: write
  actions: write

jobs:
  run-pipeline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: aeswibon/pipeline-compose-run@v0.3.0
        with:
          pipeline_file: .github/pipelines/pipeline.yml
          github_token: ${{ github.token }}
```

Entry template: [pipeline-compose templates/pipeline-run.yml](https://github.com/aeswibon/pipeline-compose/blob/master/templates/pipeline-run.yml)

### Pipeline file

Create `.github/pipelines/pipeline.yml`:

```yaml
name: pipeline
version: 1
stages:
  - id: ci
    workflow: .github/workflows/ci.yml

  - id: deploy
    workflow: .github/workflows/deploy.yml
    needs:
      - ci
    inputs:
      version: ${{ context.ci.version }}
    when: startsWith(github.ref, 'refs/tags/v')
```

| Field | Description |
|-------|-------------|
| `id` | Stage identifier (used in `needs` and `context.<id>.*`) |
| `workflow` | Path to a workflow file in **your** repo |
| `needs` | Prior stage ids (topological order) |
| `inputs` | Passed to `workflow_dispatch` (supports `${{ context.<stage>.<key> }}`) |
| `outputs` | Keys collected from the stage for downstream `context` |
| `when` | Optional expression; false skips dispatch |

Schema: [pipeline-v1.schema.json](https://github.com/aeswibon/pipeline-compose/blob/master/packages/core/schema/pipeline-v1.schema.json)

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `pipeline_file` | yes | — | Path to pipeline YAML |
| `ref` | no | `GITHUB_REF` | Git ref passed to each stage dispatch |
| `github_token` | no | `github.token` | Token with `actions: write` |

## Outputs

| Output | Description |
|--------|-------------|
| `results_json` | JSON array of `{ stageId, runId, outputs }` per completed stage |

## Permissions

When dispatching workflows in the same repository:

```yaml
permissions:
  contents: write
  actions: write
```

## Stage workflows

Each stage workflow must:

1. Include a `workflow_dispatch` trigger (with inputs referenced by the pipeline).
2. Export outputs listed under `outputs` in the pipeline file.

Because GitHub does not return job outputs for `workflow_dispatch` runs, upload an artifact named `pipeline-compose-<stage-id>` containing `outputs.json`:

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

More examples: [pipeline-compose docs/examples.md](https://github.com/aeswibon/pipeline-compose/blob/master/docs/examples.md)

## Related actions

| Action | Use when |
|--------|----------|
| [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) | You want a committed generated workflow with native `needs:` |
| [pipeline-compose-eval](https://github.com/aeswibon/pipeline-compose-eval) | Evaluate `when:` expressions outside the run action |
| [pipeline-compose-context-merge](https://github.com/aeswibon/pipeline-compose-context-merge) | Merge stage outputs into a context file in composite workflows |

## License

[MIT](LICENSE)
