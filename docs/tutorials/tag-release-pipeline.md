---
title: "Tag release pipelines without a 400-line GitHub Actions workflow"
description: "Orchestrate ci → version sync → publish on tag push with one pipeline file and pipeline-compose-run."
canonical: https://github.com/aeswibon/pipeline-compose/blob/master/docs/tutorials/tag-release-pipeline.md
tags: github-actions, ci-cd, devops, release-automation
---

# Tag release pipelines without a 400-line GitHub Actions workflow

You push `v1.2.3` and expect a predictable sequence: **tests pass → version is resolved → GitHub Release is created**. In practice, teams usually pick one of two painful options:

1. **One giant workflow** — every stage in a single YAML file. It works until you need reuse, `workflow_call`, or different triggers per stage.
2. **`workflow_run` chains** — workflow A triggers workflow B. Passing outputs between runs is awkward, and renaming a workflow breaks the chain silently.

There is a middle path: keep **small, focused stage workflows** (the ones you already have), declare **order and wiring in one pipeline file**, and use a single orchestrator step on tag push.

This tutorial uses **[pipeline-compose-run](https://github.com/marketplace/actions/pipeline-compose-run)** — available on the GitHub Marketplace — and a copy-paste example you can drop into any repo.

**Full example (copy `.github/`):** [examples/run-tag-release](https://github.com/aeswibon/pipeline-compose/tree/master/examples/run-tag-release)

---

## What we are building

On `git push origin v*`:

```text
release.yml          ← one job, one action step
  └─ pipeline.yml    ← declares order + wiring
       ├─ ci.yml
       ├─ stage-version-sync.yml     → exports version
       └─ stage-release-publish.yml  ← receives version
```

No generated workflow to commit. No manual `workflow_run` graph.

---

## Step 1 — Entry workflow

Create `.github/workflows/release.yml`:

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
      - uses: aeswibon/pipeline-compose-run@v1.13.0
        with:
          pipeline_file: .github/pipelines/pipeline.yml
          github_token: ${{ github.token }}
```

The `actions: write` permission is required because the action dispatches your stage workflows via `workflow_dispatch`.

---

## Step 2 — Pipeline file (order only)

Create `.github/pipelines/pipeline.yml`:

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

      - id: release-publish
        workflow: .github/workflows/stage-release-publish.yml
        needs:
          - version-sync
        inputs:
          version: ${{ context.version-sync.version }}
```

This file is the **source of truth for order**. Stage implementations stay in normal workflow files you can also run manually or reuse via `workflow_call`.

The `${{ context.version-sync.version }}` syntax resolves at runtime from the completed **version-sync** stage.

---

## Step 3 — Stage workflows

Each stage must include `workflow_dispatch`. Downstream stages that receive values need matching `workflow_dispatch` inputs.

### CI (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  workflow_dispatch:
  push:
    branches: [master]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: echo "Replace with your test/lint commands"
```

### Version sync — export outputs

GitHub’s API does **not** return job outputs for `workflow_dispatch` runs. pipeline-compose collects stage outputs from an artifact:

- **Artifact name:** `pipeline-compose-<stage-id>`
- **File:** `outputs.json` with your output keys

```yaml
name: Version sync
on:
  workflow_dispatch:

jobs:
  version-sync:
    runs-on: ubuntu-latest
    steps:
      - name: Resolve semver from ref
        id: version
        run: |
          ref="${GITHUB_REF}"
          if [[ "$ref" =~ ^refs/tags/v(.+)$ ]]; then
            echo "value=${BASH_REMATCH[1]}" >> "$GITHUB_OUTPUT"
          else
            echo "Expected a version tag ref, got: $ref" >&2
            exit 1
          fi

      - uses: aeswibon/pipeline-compose-export@v1.13.0
        if: success()
        with:
          stage_id: version-sync
          outputs: '{"version":"${{ steps.version.outputs.value }}"}'
```

Artifact name is set by the action: `pipeline-compose-version-sync` (matches stage `id`).

### Release publish — consume version input

```yaml
name: Release publish
on:
  workflow_dispatch:
    inputs:
      version:
        description: Semver without v prefix
        type: string
        required: true

permissions:
  contents: write

jobs:
  create-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Create release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          VERSION: ${{ inputs.version }}
        run: |
          tag="v${VERSION}"
          if gh release view "$tag" >/dev/null 2>&1; then
            echo "Release $tag already exists"
            exit 0
          fi
          gh release create "$tag" --title "$tag" --generate-notes
```

---

## Step 4 — Ship it

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Open **Actions → Release** in your repo. Stages run in pipeline order; publish receives the version from sync.

---

## Why not other approaches?

| Approach | Pain point |
|----------|------------|
| Monolithic workflow | Hard to reuse stages; noisy diffs |
| `workflow_run` chains | Fragile; outputs don’t flow cleanly |
| Generated workflow (compile) | Works, but you commit generated YAML |
| **pipeline-compose-run** | Ordered dispatch + context; one pipeline file |

If you prefer committing a static graph with native GitHub `needs:`, see [pipeline-compose-compile](https://github.com/marketplace/actions/pipeline-compose-compile) instead.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `403` on dispatch | Add `actions: write` on the entry job |
| Publish stage missing version | Artifact must be `pipeline-compose-version-sync` with `outputs.json` |
| Stage never runs | Add `workflow_dispatch` to that workflow |
| Wrong ref in stage | Pass `ref:` to the run action if needed |

---

## Try it now

1. **Marketplace:** [pipeline-compose-run](https://github.com/marketplace/actions/pipeline-compose-run)
2. **Copy-paste example:** [examples/run-tag-release](https://github.com/aeswibon/pipeline-compose/tree/master/examples/run-tag-release)
3. **More examples:** [pipeline-compose/examples](https://github.com/aeswibon/pipeline-compose/tree/master/examples)

---

*Part of [pipeline-compose](https://github.com/aeswibon/pipeline-compose). MIT License.*
