# pipeline-compose

Compile declarative pipeline YAML into ordered GitHub Actions workflows — explicit `needs:` graphs, shared context between stages, and no `workflow_run` chains.

# Setup

Use **one pipeline file** per repository. pipeline-compose validates your YAML and emits a static reusable workflow you commit to the repo. A small runner workflow checks freshness on PR and runs the pipeline on tags.

**Fixed paths (convention):**

| Path | You |
|------|-----|
| `.github/pipelines/pipeline.yml` | Edit — stage order and wiring |
| `.github/workflows/pipeline.generated.yml` | Commit — compiled output (do not edit by hand) |
| `.github/workflows/pipeline.yml` | Copy once from [templates/pipeline-runner.yml](templates/pipeline-runner.yml) |
| `.github/workflows/stage-*.yml` | Your callable stage workflows |

**Steps:**

1. **Create stage workflows** — each with `on: workflow_call:` only (no tag/push triggers on stages).

2. **Define the pipeline** — `.github/pipelines/pipeline.yml`:

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

3. **Add the runner** — copy [templates/pipeline-runner.yml](templates/pipeline-runner.yml) to `.github/workflows/pipeline.yml`.

4. **Compile and commit** — run the compile action (or CLI) and commit both the pipeline and generated workflow together.

5. **Push a tag** — the runner calls `pipeline.generated.yml`, which runs stages in order via compiled `needs:` edges.

More walkthroughs: [docs/examples.md](docs/examples.md).

# Usage

```yaml
- uses: aeswibon/pipeline-compose/compile@master
  with:
    # Path to canonical pipeline YAML
    pipeline_file: .github/pipelines/pipeline.yml

    # Write generated workflow to this path
    output: .github/workflows/pipeline.generated.yml

    # Fail when output exists and differs from compiled result
    check: 'false'

    # Optional: inline YAML; stages replace file stages
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

## CI freshness check on pull request

Add to your runner or existing CI workflow:

```yaml
- uses: actions/checkout@v6
- uses: aeswibon/pipeline-compose/compile@master
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    output: .github/workflows/pipeline.generated.yml
    check: "true"
```

Fails the job if someone changed the pipeline but forgot to recompile and commit `pipeline.generated.yml`.

## Run pipeline on tag push

Use the [runner template](templates/pipeline-runner.yml). On `v*` tag push, the `run-pipeline` job calls the committed generated workflow:

```yaml
run-pipeline:
  if: startsWith(github.ref, 'refs/tags/v')
  uses: ./.github/workflows/pipeline.generated.yml
  secrets: inherit
```

## Pass outputs between stages

In pipeline YAML:

```yaml
inputs:
  version: ${{ context.version-sync.version }}
```

Compiles to:

```yaml
with:
  version: ${{ needs.version-sync.outputs.version }}
```

## Conditional stage

```yaml
stages:
  - id: version-sync
    workflow: .github/workflows/stage-version-sync.yml
    when: startsWith(github.ref, 'refs/tags/v')
```

`when:` becomes job `if:` in the generated workflow.

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

Compile-only check:

```yaml
permissions:
  contents: read
```

When stages push commits, retag, create releases, or dispatch workflows:

```yaml
permissions:
  contents: write
  actions: write
```

# Action version

| Ref | When to use |
|-----|-------------|
| `@master` | Latest on the default branch |
| `@v1` | After tag `v1` is published on this repository |

Pin a release tag when you want stable behavior:

```bash
git tag v1 && git push origin v1
```

# See also

| Doc | Contents |
|-----|----------|
| [docs/examples.md](docs/examples.md) | Multi-stage deploy, stage contracts, CLI, troubleshooting |
| [docs/development.md](docs/development.md) | Building and testing pipeline-compose locally |
| [schema/pipeline-v1.schema.json](schema/pipeline-v1.schema.json) | Pipeline YAML schema |

# License

MIT
