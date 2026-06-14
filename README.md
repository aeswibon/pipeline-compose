# pipeline-compose

Define **in what order** your GitHub Actions workflows run. Add one pipeline file and one `run` step — no compile step and no generated workflow to commit.

The action reads your pipeline YAML, dispatches each stage workflow in order, waits for completion, and passes outputs to later stages.

# Usage

```yaml
- uses: aeswibon/pipeline-compose/run@master
  with:
    # Path to pipeline YAML (stage order and wiring)
    pipeline_file: .github/pipelines/pipeline.yml

    # Git ref for each workflow_dispatch (default: GITHUB_REF)
    ref: ''

    # Token with actions:write to dispatch workflows (default: GITHUB_TOKEN)
    github_token: ''
```

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `pipeline_file` | yes | — | Path to pipeline YAML |
| `ref` | no | `GITHUB_REF` | Ref passed to each stage dispatch |
| `github_token` | no | `github.token` in workflow | Token with `actions: write` |

| Output | Description |
|--------|-------------|
| `results_json` | JSON array of `{ stageId, runId, outputs }` per completed stage |

# Scenarios

## Run ordered workflows on tag push

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
      - uses: aeswibon/pipeline-compose/run@master
        with:
          pipeline_file: .github/pipelines/pipeline.yml
          github_token: ${{ github.token }}
```

Template: [templates/pipeline-run.yml](templates/pipeline-run.yml)

## Define a pipeline file

Create `.github/pipelines/pipeline.yml`:

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

Each stage `workflow` path must point at an existing workflow file in your repo.

## Pass outputs between stages

Reference a prior stage's job outputs in later stage inputs:

```yaml
inputs:
  version: ${{ context.version-sync.version }}
```

At runtime the action resolves these from the completed stage's outputs.

## Skip a stage conditionally

```yaml
stages:
  - id: deploy
    workflow: .github/workflows/deploy.yml
    when: startsWith(github.ref, 'refs/tags/v')
```

Stages with a false `when` expression are not dispatched.

## Prepare stage workflows

Each stage workflow must include `workflow_dispatch`. If downstream stages need values, declare matching `workflow_dispatch` inputs.

Stage jobs must expose outputs listed under `outputs` in the pipeline file.

Because GitHub's API does not return job outputs for `workflow_dispatch` runs, upload an artifact named `pipeline-compose-<stage-id>` containing `outputs.json`:

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

See [docs/examples.md](docs/examples.md) for full stage contracts and troubleshooting.

# Recommended permissions

When the run action dispatches other workflows in the same repository:

```yaml
permissions:
  contents: write
  actions: write
```

# Action version

| Ref | When to use |
|-----|-------------|
| `@v0.1.0` | Released tag |
| `@master` | Latest on the default branch |

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
