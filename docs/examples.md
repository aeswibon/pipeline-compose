# pipeline-compose — usage examples

This guide shows how to define a pipeline, compile it, wire an entry workflow, and run ordered reusable-workflow stages without `workflow_run` glue.

## Mental model

| Piece | Role |
|-------|------|
| **Pipeline YAML** (`.github/pipelines/*.yml`) | Declarative source — stages, order, inputs |
| **Generated workflow** (`*.generated.yml`) | Static GitHub workflow with `needs:` edges (commit this) |
| **Entry workflow** | Listens for events (tag push, manual, etc.) and calls the generated workflow |
| **Stage workflows** | Callable-only (`workflow_call`) — never trigger release logic on their own |

pipeline-compose **compiles** the pipeline file into the generated workflow. GitHub Actions runs the generated file, not the pipeline YAML directly.

---

## Example 1 — Two-stage tag release (this repo)

Real files in this repository:

**Pipeline** — `.github/pipelines/tag-release.yml`

```yaml
name: tag-release
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

**Compiled output** — `.github/workflows/tag-release.generated.yml` (do not edit by hand)

```yaml
jobs:
  version-sync:
    uses: ./.github/workflows/stage-version-sync.yml
    secrets: inherit
  release-publish:
    uses: ./.github/workflows/stage-release-publish.yml
    secrets: inherit
    needs:
      - version-sync
    with:
      version: ${{ needs.version-sync.outputs.version }}
      skip_publish: ${{ needs.version-sync.outputs.skip_publish }}
```

**Entry workflow** — `.github/workflows/tag-release.yml`

```yaml
name: Tag release
on:
  push:
    tags: ["v*"]
jobs:
  run-tag-release-pipeline:
    uses: ./.github/workflows/tag-release.generated.yml
    secrets: inherit
```

Compile + freshness check run in **CI** (`compile-tag-release-freshness`), not on tag push.

**Flow on `git push origin v0.2.0`:**

1. Entry workflow runs (only listener for tags).
2. `version-sync` updates `package.json`, commits to `master`, retags.
3. `release-publish` creates the GitHub Release (and may dispatch CI).

Stage workflows have **no** `push: tags` triggers — they only run when the compiled pipeline calls them.

---

## Example 2 — Sync → build → deploy (consumer repo)

Typical multi-service release pipeline:

**`.github/pipelines/release.yml`**

```yaml
name: release
version: 1
context:
  ref: ${{ github.ref }}
stages:
  - id: version-sync
    workflow: .github/workflows/stage-version-sync.yml
    when: startsWith(github.ref, 'refs/tags/v')
    outputs:
      - version

  - id: build
    workflow: .github/workflows/test-and-build.yml
    needs:
      - version-sync
    inputs:
      release: "true"
      version: ${{ context.version-sync.version }}
    outputs:
      - image_tag

  - id: deploy
    workflow: .github/workflows/deploy.yml
    needs:
      - build
    environment: production
    inputs:
      image_tag: ${{ context.build.image_tag }}
```

**Compile:**

```bash
pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/release.yml \
  -o .github/workflows/release.generated.yml
```

**Entry on tag push:**

```yaml
name: Release
on:
  push:
    tags: ["v*"]
jobs:
  release:
    uses: ./.github/workflows/release.generated.yml
    secrets: inherit
```

The `when:` on `version-sync` becomes `if:` on that job in the generated workflow. Stages without `needs` run first; `deploy` waits for `build`, which waits for `version-sync`.

---

## Example 3 — Writing a stage workflow

Each stage must be a **reusable workflow** with `workflow_call`.

**`.github/workflows/stage-version-sync.yml`**

```yaml
name: Version sync
on:
  workflow_call:
    outputs:
      version:
        value: ${{ jobs.version-sync.outputs.version }}
      skip_publish:
        value: ${{ jobs.version-sync.outputs.skip_publish }}

jobs:
  version-sync:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.tag.outputs.version }}
      skip_publish: ${{ steps.git-state.outputs.skip_publish }}
    steps:
      - uses: actions/checkout@v6
      # resolve tag, sync files, commit + retag ...
```

Rules:

- Expose **outputs** at the `workflow_call` level (map from job outputs).
- Accept **inputs** under `workflow_call.inputs` when downstream stages need them.
- Do **not** add tag/branch triggers on stage workflows if they should only run via the pipeline.
- The generated job must pass `secrets: inherit` (pipeline-compose adds this automatically).

---

## Example 4 — CLI

```bash
# Compile to stdout
pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/tag-release.yml

# Write generated workflow
pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/tag-release.yml \
  -o .github/workflows/tag-release.generated.yml

# Fail if committed generated file is stale (use in CI)
pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/tag-release.yml \
  -o .github/workflows/tag-release.generated.yml \
  --check
```

---

## Example 5 — Compile action

**One-off compile in a workflow:**

```yaml
- uses: aeswibon/pipeline-compose/compile@v1
  with:
    pipeline_file: .github/pipelines/tag-release.yml
    output: .github/workflows/tag-release.generated.yml
```

**CI freshness gate** (fails PR if generated YAML is out of date):

```yaml
- uses: ./compile   # or aeswibon/pipeline-compose/compile@v1
  with:
    pipeline_file: .github/pipelines/tag-release.yml
    output: .github/workflows/tag-release.generated.yml
    check: "true"
```

**Inline override** (experiments — replaces `stages` from the file):

```yaml
- uses: aeswibon/pipeline-compose/compile@v1
  with:
    pipeline_file: .github/pipelines/tag-release.yml
    pipeline_inline: |
      stages:
        - id: release-publish
          workflow: .github/workflows/stage-release-publish.yml
          inputs:
            version: "0.0.0"
            skip_publish: "true"
    output: /tmp/experiment.generated.yml
```

When `pipeline_inline` is set, its `stages` list **replaces** the file's stages. Top-level `context` keys **shallow-merge** with the file.

---

## Example 6 — Context wiring

In pipeline YAML, reference a prior stage's outputs with:

```yaml
${{ context.<stage-id>.<output-name> }}
```

pipeline-compose compiles that to GitHub Actions syntax:

```yaml
${{ needs.<stage-id>.outputs.<output-name> }}
```

| Pipeline source | Compiled |
|-----------------|----------|
| `${{ context.version-sync.version }}` | `${{ needs.version-sync.outputs.version }}` |
| `${{ context.build.image_tag }}` | `${{ needs.build.outputs.image_tag }}` |

The `outputs` list on a stage documents which keys are available to later stages (validation/documentation; wiring uses `inputs` + `context`).

---

## Example 7 — Stage fields reference

```yaml
stages:
  - id: build                    # job id in generated workflow (kebab-case)
    workflow: .github/workflows/test-and-build.yml
    when: github.ref == 'refs/heads/master'   # optional → job `if:`
    needs: [version-sync]        # optional → job `needs:`
    environment: production      # optional → job `environment:`
    inputs:                      # optional → job `with:`
      release: "true"
      version: ${{ context.version-sync.version }}
    outputs:                     # documented outputs for later stages
      - image_tag
```

Schema: `schema/pipeline-v1.schema.json` (v1, max 10 stages).

---

## Example 8 — Recommended repo layout

```text
.github/
  pipelines/
    tag-release.yml          # canonical pipeline (edit this)
  workflows/
    tag-release.yml          # entry workflow (triggers)
    tag-release.generated.yml  # compiled graph (commit; CI checks freshness)
    stage-version-sync.yml     # callable stage
    stage-release-publish.yml  # callable stage
    ci.yml
scripts/ci/
  sync-versions-from-tag.sh
  publish-version-sync.sh
```

**Edit flow:**

1. Change `.github/pipelines/tag-release.yml` or a stage workflow.
2. Run compile (CLI or action).
3. Commit pipeline + generated workflow together.
4. CI `compile-tag-release-freshness` / `--check` prevents drift.

---

## Example 9 — Local testing

```bash
pnpm install
pnpm test
pnpm run build
pnpm run lint:workflows

# Compile locally
pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/tag-release.yml \
  -o /tmp/out.yml && cat /tmp/out.yml

# act smoke (compile action only)
export ACT_DOCKER_SOCKET="${HOME}/.orbstack/run/docker.sock"
pnpm run act:compile
```

See [.github/act/README.md](../.github/act/README.md) for act guardrails.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Stage runs on its own when you push a tag | Stage workflow has `push: tags` — remove it; only the entry workflow should listen for tags. |
| `needs.X.outputs.Y` empty | Stage workflow missing `workflow_call.outputs`, or upstream job did not set job outputs. |
| CI fails "Stale generated workflow" | Recompile and commit `*.generated.yml` after editing the pipeline. |
| YAML parse error on generated `name:` | Names with `:` must be quoted — recompile with current pipeline-compose (emitter quotes automatically). |
| `context.foo.bar` not rewritten | Typo in stage id or output name; must match an earlier stage's `id` and declared `outputs`. |

---

## Related

- [README](../README.md) — quick start and component map
- [tag-release pipeline](../.github/pipelines/tag-release.yml) — live dogfooding example
- [pipeline v1 schema](../schema/pipeline-v1.schema.json)
