# pipeline-compose-run

**Run GitHub Actions workflows in order — one pipeline file, no generated YAML.**

Dispatches each stage via `workflow_dispatch`, waits for completion, and passes outputs to later stages. Part of [pipeline-compose](https://github.com/aeswibon/pipeline-compose).

## Start here — tag release pipeline

The most common setup: on tag push, run **ci → version sync → publish** in order.

**`.github/workflows/release.yml`**

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
      - uses: aeswibon/pipeline-compose-run@v0.3.1
        with:
          pipeline_file: .github/pipelines/pipeline.yml
          github_token: ${{ github.token }}
```

**`.github/pipelines/pipeline.yml`**

```yaml
name: pipeline
version: 1
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

Full walkthrough: [examples/run-tag-release](https://github.com/aeswibon/pipeline-compose/tree/master/examples/run-tag-release) · [Blog tutorial](https://github.com/aeswibon/pipeline-compose/blob/master/docs/tutorials/tag-release-pipeline.md)

<!-- start usage -->
```yaml
- uses: aeswibon/pipeline-compose-run@v0.3.1
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    github_token: ${{ github.token }}
```
<!-- end usage -->

## Pipeline file reference

| Field | Description |
|-------|-------------|
| `id` | Stage identifier (used in `needs` and `context.<id>.*`) |
| `workflow` | Path to a workflow file in **your** repo |
| `needs` | Prior stage ids (topological order) |
| `inputs` | Passed to `workflow_dispatch` (supports `${{ context.<stage>.<key> }}`) |
| `outputs` | Keys collected from the stage for downstream `context` |
| `when` | Optional expression; false skips dispatch |

Schema: [pipeline-v1.schema.json](https://github.com/aeswibon/pipeline-compose/blob/master/packages/core/schema/pipeline-v1.schema.json) · [pipeline-v2.schema.json](https://github.com/aeswibon/pipeline-compose/blob/master/packages/core/schema/pipeline-v2.schema.json)

### `when:` on the run path

The run action evaluates `when:` locally before dispatch. Supported forms:

- `startsWith(github.ref, 'refs/tags/v')`
- `github.ref == 'refs/heads/master'`
- `context.<stage>.<output> == 'value'`
- `true` / `false`

If a stage is skipped, downstream stages that `needs:` it are skipped too.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `pipeline_file` | one of file/dir | — | Path to pipeline YAML (v1 or v2) |
| `pipeline_dir` | one of file/dir | — | Directory of v1 pipeline files merged by pipeline `needs` |
| `ref` | no | `GITHUB_REF` | Git ref passed to each stage dispatch |
| `github_token` | no | `github.token` | Token with `actions: write` |

## Outputs

| Output | Description |
|--------|-------------|
| `results_json` | JSON array of `{ stageId, runId, outputs }` per completed stage |

## Permissions

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
- uses: actions/upload-artifact@v7
  with:
    name: pipeline-compose-my-stage
    path: pipeline-compose/outputs.json
    retention-days: 1
```

More examples: [pipeline-compose docs/examples.md](https://github.com/aeswibon/pipeline-compose/blob/master/docs/examples.md)

## Compare approaches

| Approach | Tradeoff |
|----------|----------|
| **`workflow_run` chains** | Hard to pass outputs; easy to break when renaming workflows |
| **One monolithic workflow** | Simple at first; painful as release stages grow |
| **pipeline-compose-compile** | Native GitHub `needs:` but you commit generated YAML |
| **pipeline-compose-run** | Ordered dispatch + context; one pipeline file; no codegen |

## Related actions

| Action | Use when |
|--------|----------|
| [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) | You want a committed generated workflow with native `needs:` |
| [pipeline-compose-eval](https://github.com/aeswibon/pipeline-compose-eval) | Evaluate `when:` expressions outside the run action |
| [pipeline-compose-context-merge](https://github.com/aeswibon/pipeline-compose-context-merge) | Merge stage outputs into a context file in composite workflows |

## License

[MIT](LICENSE)
