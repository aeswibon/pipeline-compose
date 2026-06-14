# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-06-14

### Changed

- **Monorepo refactor** — pnpm workspace with shared `@aeswibon/pipeline-compose-core` and packages for CLI and all four actions (`packages/core`, `packages/cli`, `packages/action-*`).
- Single development surface: edit core once, test with `pnpm test`, bundle with `pnpm run bundle:actions`, publish with `pnpm run publish:actions`.
- Removed legacy root `src/`, `bin/`, and `schema/`; schema now lives at `packages/core/schema/`.
- CI compile parity uses `./packages/action-compile` (built in CI, not committed).
- Replaced sibling-repo scaffold scripts with `scripts/publish-action-packages.sh`.

### Developer notes

See [docs/development.md](docs/development.md) and [docs/action-repos.md](docs/action-repos.md).

## [0.2.0] - 2026-06-14

### Changed

- **Actions split into dedicated repositories** (Marketplace-ready, root `action.yml` each):
  - [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) — `aeswibon/pipeline-compose-run@v0.1.0`
  - [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) — `aeswibon/pipeline-compose-compile@v0.1.0`
  - [pipeline-compose-eval](https://github.com/aeswibon/pipeline-compose-eval) — `aeswibon/pipeline-compose-eval@v0.1.0`
  - [pipeline-compose-context-merge](https://github.com/aeswibon/pipeline-compose-context-merge) — `aeswibon/pipeline-compose-context-merge@v0.1.0`
- This repo is now **CLI, schema, docs, and release workflows** only (embedded actions removed).
- Tag releases use [`.github/workflows/release.yml`](.github/workflows/release.yml) with native reusable workflows (`ci` → `version-sync` → `release-publish`).
- Required `CHANGELOG.md` section enforced before every tag release.

### Migration

```yaml
# before
uses: aeswibon/pipeline-compose/run@v0.1.0

# after
uses: aeswibon/pipeline-compose-run@v0.1.0
```

See [docs/action-repos.md](docs/action-repos.md).

## [0.1.0] - 2026-06-14

First release of **pipeline-compose** — define the order your GitHub Actions workflows run with one pipeline YAML file and one action step. No compile step and no generated workflow to commit.

### Added

- **`run` action** (`aeswibon/pipeline-compose/run@v0.1.0`) — primary runtime orchestrator
  - Reads pipeline YAML (schema v1) and topologically sorts stages by `needs`
  - Dispatches each stage via `workflow_dispatch`, waits for completion, chains the next stage
  - Passes prior stage outputs into later inputs via `${{ context.<stage-id>.<output> }}`
  - Conditional stages with `when:` (supported expression subset)
  - `results_json` output: JSON array of `{ stageId, runId, outputs }` per completed stage
- **`compile` action** — optional static workflow codegen for teams that prefer a committed runner workflow
- **CLI** — `pipeline-compose compile` and `pipeline-compose eval` for local validation and codegen
- **Pipeline schema v1** — `name`, `version`, `stages[]` with `id`, `workflow`, `needs`, `inputs`, `outputs`, `when`
- **Artifact-based output collection** — stages export `pipeline-compose-<stage-id>/outputs.json` because GitHub's API does not return job outputs for `workflow_dispatch` runs
- **Documentation** — consumer-focused [README](README.md), [docs/examples.md](docs/examples.md), [docs/development.md](docs/development.md)
- **Template** — [templates/pipeline-run.yml](templates/pipeline-run.yml) entry workflow for tag/release pipelines

### Usage

```yaml
permissions:
  contents: write
  actions: write

jobs:
  run-pipeline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: aeswibon/pipeline-compose/run@v0.1.0
        with:
          pipeline_file: .github/pipelines/pipeline.yml
          github_token: ${{ github.token }}
```

### Stage contract

Each stage workflow must:

1. Include a `workflow_dispatch` trigger (with inputs referenced by the pipeline)
2. Upload an artifact named `pipeline-compose-<stage-id>` containing `outputs.json` for any output keys listed in the pipeline file

See [docs/examples.md](docs/examples.md) for full stage examples and troubleshooting.

### Permissions

The token passed to `github_token` requires **`actions: write`** to dispatch workflows in the same repository. Release pipelines often also need **`contents: write`**.

### Limitations (v0.1.0)

- Same-repository stages only
- Each stage runs as a separate workflow dispatch (not inlined jobs)
- Cross-stage data requires artifact export (see above)
- `when` expressions support a subset of GitHub expression syntax

### Planned

- Cross-repo stage dispatch
- Richer expression support
- Reusable stage catalog patterns

[0.2.0]: https://github.com/aeswibon/pipeline-compose/releases/tag/v0.2.0
[0.1.0]: https://github.com/aeswibon/pipeline-compose/releases/tag/v0.1.0
