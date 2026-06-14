# pipeline-compose

Compile declarative pipeline YAML into ordered GitHub Actions workflows — explicit `needs:` graphs, shared context between stages, and no `workflow_run` chains.

Define one pipeline file per repo (`.github/pipelines/pipeline.yml`). pipeline-compose emits a static reusable workflow you commit and run from a generic runner workflow.

# Usage

```yaml
- uses: aeswibon/pipeline-compose/compile@master
  with:
    # Path to canonical pipeline YAML
    pipeline_file: .github/pipelines/pipeline.yml

    # Output path for generated workflow (omit to emit to step output only)
    output: .github/workflows/pipeline.generated.yml

    # Fail if output exists and differs from compiled result
    check: 'false'

    # Optional inline YAML override (replaces stages from file)
    pipeline_inline: ''
```

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `pipeline_file` | yes | — | Path to pipeline YAML |
| `output` | no | — | Write generated workflow to this path |
| `check` | no | `false` | Fail when `output` is stale vs compiled result |
| `pipeline_inline` | no | `''` | Inline YAML; `stages` replace file stages |

| Output | Description |
|--------|-------------|
| `workflow_path` | Path written when `output` is set |
| `workflow_yaml` | Generated YAML when `output` is not set |

# Scenarios

## Define a pipeline

Edit `.github/pipelines/pipeline.yml`:

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

`${{ context.<stage>.<output> }}` compiles to `${{ needs.<stage>.outputs.<output> }}`.

## Add the runner workflow

Copy [templates/pipeline-runner.yml](templates/pipeline-runner.yml) to `.github/workflows/pipeline.yml`:

```yaml
name: Pipeline
on:
  push:
    branches: [master]
    tags: ["v*"]
  pull_request:
jobs:
  compile-check:
    if: github.event_name != 'push' || !startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: aeswibon/pipeline-compose/compile@master
        with:
          pipeline_file: .github/pipelines/pipeline.yml
          output: .github/workflows/pipeline.generated.yml
          check: "true"
  run-pipeline:
    if: startsWith(github.ref, 'refs/tags/v')
    uses: ./.github/workflows/pipeline.generated.yml
    secrets: inherit
```

On PR and branch push, CI verifies the committed generated file is fresh. On tag push, the runner calls the generated workflow at that tag.

## Compile locally (CLI)

```bash
pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/pipeline.yml \
  -o .github/workflows/pipeline.generated.yml
```

Fail if the committed file is stale:

```bash
pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/pipeline.yml \
  -o .github/workflows/pipeline.generated.yml \
  --check
```

## CI freshness gate only

Use the compile action without a runner if you only want to block stale generated YAML on PR:

```yaml
- uses: aeswibon/pipeline-compose/compile@master
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    output: .github/workflows/pipeline.generated.yml
    check: "true"
```

## Tag release (multi-stage)

1. Commit `.github/pipelines/pipeline.yml` and `.github/workflows/pipeline.generated.yml`.
2. Push a tag: `git tag v1.0.0 && git push origin v1.0.0`.
3. `run-pipeline` calls each stage in order via compiled `needs:` edges.

Stage workflows must use `workflow_call` only — do not add tag/push triggers on stages.

## Pass context between stages

Pipeline YAML:

```yaml
inputs:
  version: ${{ context.version-sync.version }}
```

Compiled workflow:

```yaml
with:
  version: ${{ needs.version-sync.outputs.version }}
```

## Inline override (experiments)

```yaml
- uses: aeswibon/pipeline-compose/compile@master
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    pipeline_inline: |
      stages:
        - id: release-publish
          workflow: .github/workflows/stage-release-publish.yml
          inputs:
            version: "0.0.0"
            skip_publish: "true"
    output: /tmp/experiment.generated.yml
```

# Recommended permissions

When stages push commits, retag, create releases, or dispatch workflows:

```yaml
permissions:
  contents: write
  actions: write
```

For compile-only CI checks:

```yaml
permissions:
  contents: read
```

# Versioning

GitHub Actions resolves `owner/repo/path@ref` from a **git ref** on the default branch (tag or branch name).

| Ref | When to use |
|-----|-------------|
| `@master` | Works today — tracks latest on the default branch |
| `@v1` | After you publish tag `v1` (see below) |

**This repository** dogfoods the local action (`./compile`) in `.github/workflows/pipeline.yml` so CI does not depend on a published tag.

**Consumer repos** use `aeswibon/pipeline-compose/compile@master` until a release tag exists, then pin `@v1`:

```bash
git tag v1
git push origin v1
```

After that, consumers can switch to `aeswibon/pipeline-compose/compile@v1`.

# What's in this repository

This repo dogfoods pipeline-compose for its own releases:

| Path | Role |
|------|------|
| `.github/pipelines/pipeline.yml` | Release stage order (version-sync → release-publish) |
| `.github/workflows/pipeline.generated.yml` | Committed compiled graph |
| `.github/workflows/pipeline.yml` | Generic runner (compile check + tag dispatch) |
| `.github/workflows/ci.yml` | Unit tests, compile parity, workflow lint |

```bash
git tag v0.2.0 && git push origin v0.2.0
```

More examples: [docs/examples.md](docs/examples.md).

# Other actions

| Path | Description |
|------|-------------|
| [`compile/`](compile/action.yml) | Validate pipeline YAML, emit generated workflow |
| [`eval/`](eval/action.yml) | Evaluate `when:` expressions (subset) |
| [`context/merge/`](context/merge/action.yml) | Merge stage outputs into a context JSON file |

Pipeline schema: [`schema/pipeline-v1.schema.json`](schema/pipeline-v1.schema.json)

# Development

```bash
pnpm install
pnpm test
pnpm run build
pnpm run lint:workflows
```

Local act smoke: [.github/act/README.md](.github/act/README.md)

# License

MIT
