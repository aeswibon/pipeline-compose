# pipeline-compose

**Compile declarative pipeline YAML into ordered GitHub Actions workflows** — explicit `needs:` graphs, shared context between stages, and no `workflow_run` chains.

Define stages once in `.github/pipelines/*.yml`. pipeline-compose emits a static reusable workflow you commit and call from an entry workflow.

## The problem

Release pipelines split across multiple workflow files usually accumulate glue:

- `workflow_run` + API polling to detect completion
- Repeated `if` guards in every workflow
- Manual `gh workflow run` after retags
- Re-fetching outputs the previous workflow already had

Inside a **single** workflow file, GitHub gives you `needs:` and job outputs. pipeline-compose brings that ergonomics to **multi-workflow** pipelines.

## How it works

```text
.github/pipelines/tag-release.yml     ← you edit this (stages + wiring)
           │
           ▼  compile (CLI or action)
.github/workflows/tag-release.generated.yml   ← commit this (needs: graph)
           │
           ▼  called by entry workflow on tag push
stage-version-sync  →  stage-release-publish
```

| Layer | File | Triggers |
|-------|------|----------|
| Pipeline source | `.github/pipelines/*.yml` | — |
| Generated graph | `*.generated.yml` | `workflow_call` only |
| Entry workflow | `tag-release.yml` | tag push only |
| Stage workflows | `stage-*.yml` | `workflow_call` only (no tag/push triggers) |

Stage workflows should **not** listen for tags or pushes directly. The entry workflow is the only front door; stages run when the compiled graph calls them.

## Quick start

### 1. Define a pipeline

```yaml
# .github/pipelines/tag-release.yml
name: tag-release
version: 1
stages:
  - id: version-sync
    workflow: .github/workflows/stage-version-sync.yml
    outputs: [version, skip_publish]

  - id: release-publish
    workflow: .github/workflows/stage-release-publish.yml
    needs: [version-sync]
    inputs:
      version: ${{ context.version-sync.version }}
      skip_publish: ${{ context.version-sync.skip_publish }}
```

`context.<stage>.<output>` compiles to `${{ needs.<stage>.outputs.<output> }}`.

### 2. Compile

```bash
pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/tag-release.yml \
  -o .github/workflows/tag-release.generated.yml
```

Or in CI / a workflow step:

```yaml
- uses: aeswibon/pipeline-compose/compile@v1
  with:
    pipeline_file: .github/pipelines/tag-release.yml
    output: .github/workflows/tag-release.generated.yml
    check: "true"   # fail if generated file is stale
```

### 3. Wire an entry workflow

```yaml
# .github/workflows/tag-release.yml
name: Tag release
on:
  push:
    tags: ["v*"]
jobs:
  run-tag-release-pipeline:
    uses: ./.github/workflows/tag-release.generated.yml
    secrets: inherit
```

More examples — multi-stage deploy pipelines, stage contracts, inline overrides, troubleshooting — are in **[docs/examples.md](docs/examples.md)**.

## This repository

pipeline-compose dogfoods its own compile action for releases:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

| What runs | Purpose |
|-----------|---------|
| `tag-release.yml` | Tag push → calls committed generated pipeline |
| `version-sync` stage | Sync `package.json`, commit to `master`, move tag |
| `release-publish` stage | Create GitHub Release; dispatch CI if already synced |
| `ci.yml` | Compile freshness check (`check: true`) on PR/master |

## Actions & packages

| Path | Description |
|------|-------------|
| [`compile/`](compile/action.yml) | Validate pipeline YAML, emit generated workflow |
| [`eval/`](eval/action.yml) | Evaluate `when:` expressions (subset) |
| [`context/merge/`](context/merge/action.yml) | Merge stage outputs into a context JSON file |

Pipeline schema: [`schema/pipeline-v1.schema.json`](schema/pipeline-v1.schema.json)

## Development

```bash
pnpm install
pnpm test
pnpm run build          # bundle compile/ and eval/ actions
pnpm run lint:workflows # actionlint + yamllint
```

**Local act smoke** (optional — requires [Docker](https://docs.docker.com/get-docker/) and [act](https://github.com/nektos/act)):

```bash
export ACT_DOCKER_SOCKET="${HOME}/.orbstack/run/docker.sock"
pnpm run act:ci
pnpm run act:compile
```

Details: [.github/act/README.md](.github/act/README.md)

## Roadmap

| Version | Scope |
|---------|--------|
| **v1** | Same-repo compile, context wiring, static codegen |
| **v2** | Cross-repo dispatch + wait |
| **v3** | Org catalog (`catalog://template@version`) |

## License

MIT
