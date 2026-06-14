# pipeline-compose

Compile declarative pipeline YAML into ordered GitHub Actions reusable-workflow graphs — with shared context and less `workflow_run` glue.

## Why

Multi-workflow release pipelines (sync → build → deploy) usually need:

- `workflow_run` chains and API re-checks
- Duplicated `if` guards in every workflow
- Manual `gh workflow run` after retags

**pipeline-compose** turns a single pipeline file into a **static generated workflow** with explicit `needs:` edges and compiled input wiring.

## Quick start

### 1. Define a pipeline (canonical)

```yaml
# .github/pipelines/release.yml
name: release
version: 1
stages:
  - id: sync
    workflow: .github/workflows/sync-version.yml
    when: startsWith(github.ref, 'refs/tags/v')
  - id: build
    workflow: .github/workflows/test-and-build.yml
    needs: [sync]
    inputs:
      release: "true"
  - id: deploy
    workflow: .github/workflows/deploy.yml
    needs: [build]
    environment: production
    inputs:
      image_tag: ${{ context.build.image_tag }}
```

### 2. Compile

```bash
pnpm install
pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/release.yml \
  -o .github/workflows/release.generated.yml
```

Or use the action:

```yaml
- uses: aeswibon/pipeline-compose/compile@v1
  with:
    pipeline_file: .github/pipelines/release.yml
    output: .github/workflows/release.generated.yml
```

### 3. Entry workflow

```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  release:
    uses: ./.github/workflows/release.generated.yml
    secrets: inherit
```

### Inline override (experiments)

```yaml
- uses: aeswibon/pipeline-compose/compile@v1
  with:
    pipeline_file: .github/pipelines/release.yml
    pipeline_inline: |
      stages:
        - id: deploy
          workflow: .github/workflows/deploy.yml
```

Inline **replaces** the file `stages` list when present. Top-level `context` keys shallow-merge.

### CI freshness check

```yaml
- uses: aeswibon/pipeline-compose/compile@v1
  with:
    pipeline_file: .github/pipelines/release.yml
    output: .github/workflows/release.generated.yml
    check: 'true'
```

## Stage contract

Each stage workflow must expose `workflow_call`:

```yaml
on:
  workflow_call:
    inputs:
      image_tag:
        type: string
    outputs:
      image_tag:
        value: ${{ jobs.main.outputs.image_tag }}
    secrets: inherit
```

## Components

| Path | Role |
|------|------|
| `compile/` | Node action — validate pipeline, emit generated workflow |
| `eval/` | Evaluate `when:` expressions (subset) |
| `context/merge/` | Merge stage outputs into context JSON |
| `.github/workflows/run-pipeline.yml` | Callable compile wrapper |

## Development (pnpm)

```bash
pnpm install
pnpm test
pnpm run build
pnpm exec tsx bin/pipeline-compose.ts compile examples/pipeline-release.yml -o /tmp/out.yml
```

## Local testing with act

Requires [Docker](https://docs.docker.com/get-docker/) and [act](https://github.com/nektos/act).

```bash
export ACT_DOCKER_SOCKET="${HOME}/.orbstack/run/docker.sock"  # or Colima socket
pnpm run act:ci       # CI test job
pnpm run act:compile  # compile-example workflow via workflow_dispatch
```

See `.github/act/README.md` for fixtures and flags.

## Roadmap

- **v1** — same-repo compile + context (this release)
- **v2** — cross-repo dispatch + wait
- **v3** — org catalog (`catalog://template@version`)

## License

MIT
