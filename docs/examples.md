# pipeline-compose — usage examples

Extended guide for pipeline YAML, the compile action, runner workflow, and stage contracts. Start with the [README](../README.md) for copy-paste usage.

## Mental model

| Piece | Role |
|-------|------|
| **Pipeline YAML** (`.github/pipelines/pipeline.yml`) | Declarative source — stages, order, inputs |
| **Generated workflow** (`pipeline.generated.yml`) | Static GitHub workflow with `needs:` edges (commit this) |
| **Runner workflow** (`pipeline.yml`) | Compile check on PR/branch; runs generated graph on tags |
| **Stage workflows** | Callable-only (`workflow_call`) — never trigger release logic on their own |

pipeline-compose **compiles** the pipeline file into the generated workflow. GitHub Actions runs the generated file, not the pipeline YAML directly.

---

## Example 1 — Two-stage tag release (this repo)

**Pipeline** — `.github/pipelines/pipeline.yml`

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

**Compiled output** — `.github/workflows/pipeline.generated.yml` (do not edit by hand)

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

**Runner** — `.github/workflows/pipeline.yml` (see [templates/pipeline-runner.yml](../templates/pipeline-runner.yml))

Compile freshness runs on PR and branch push (`compile-check` job). Tag push runs `run-pipeline` only.

**Flow on `git push origin v0.2.0`:**

1. Runner `run-pipeline` job calls committed generated workflow.
2. `version-sync` updates `package.json`, commits to `master`, retags.
3. `release-publish` creates the GitHub Release (and may dispatch CI).

---

## Example 2 — Consumer setup from scratch

1. **Copy the runner template**

   ```bash
   cp templates/pipeline-runner.yml .github/workflows/pipeline.yml
   ```

2. **Create the pipeline file** — `.github/pipelines/pipeline.yml` (see Example 1 or your own stages).

3. **Add stage workflows** — each with `on: workflow_call:` only.

4. **Compile and commit**

   ```bash
   # using the action locally via npx/tsx, or compile in CI first run
   pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/pipeline.yml \
     -o .github/workflows/pipeline.generated.yml
   git add .github/pipelines/pipeline.yml .github/workflows/pipeline.generated.yml
   ```

5. **Push and tag** — runner handles the rest.

You do **not** need to clone pipeline-compose into your repo. Use `aeswibon/pipeline-compose/compile@master` (or `@v1` after the first release tag is published).

---

## Example 3 — Sync → build → deploy

**`.github/pipelines/pipeline.yml`**

```yaml
name: pipeline
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

Compile to `.github/workflows/pipeline.generated.yml`. Use the same runner template; tag push triggers the full graph.

---

## Example 4 — Writing a stage workflow

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
- The generated job passes `secrets: inherit` (pipeline-compose adds this automatically).

---

## Example 5 — CLI

```bash
pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/pipeline.yml

pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/pipeline.yml \
  -o .github/workflows/pipeline.generated.yml

pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/pipeline.yml \
  -o .github/workflows/pipeline.generated.yml \
  --check
```

---

## Example 6 — Compile action

**CI freshness gate:**

```yaml
- uses: aeswibon/pipeline-compose/compile@master
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    output: .github/workflows/pipeline.generated.yml
    check: "true"
```

**Inline override:**

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

When `pipeline_inline` is set, its `stages` list **replaces** the file's stages. Top-level `context` keys **shallow-merge** with the file.

---

## Example 7 — Context wiring

| Pipeline source | Compiled |
|-----------------|----------|
| `${{ context.version-sync.version }}` | `${{ needs.version-sync.outputs.version }}` |
| `${{ context.build.image_tag }}` | `${{ needs.build.outputs.image_tag }}` |

---

## Example 8 — Recommended repo layout

```text
.github/
  pipelines/
    pipeline.yml               # canonical pipeline (edit this)
  workflows/
    pipeline.yml               # runner (copy from templates/)
    pipeline.generated.yml     # compiled graph (commit; CI checks freshness)
    stage-version-sync.yml     # callable stage
    stage-release-publish.yml  # callable stage
    ci.yml                     # optional: your own tests (separate from runner)
templates/
  pipeline-runner.yml          # copy-paste starter for consumers
```

**Edit flow:**

1. Change `.github/pipelines/pipeline.yml` or a stage workflow.
2. Run compile (CLI or action).
3. Commit pipeline + generated workflow together.
4. Runner `compile-check` / CI `--check` prevents drift.

---

## Example 9 — Local testing

```bash
pnpm install
pnpm test
pnpm run build
pnpm run lint:workflows

pnpm exec tsx bin/pipeline-compose.ts compile .github/pipelines/pipeline.yml \
  -o /tmp/out.yml && cat /tmp/out.yml

export ACT_DOCKER_SOCKET="${HOME}/.orbstack/run/docker.sock"
pnpm run act:compile
```

See [.github/act/README.md](../.github/act/README.md).

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Stage runs on its own when you push a tag | Stage workflow has `push: tags` — remove it; only the runner should listen for tags. |
| `needs.X.outputs.Y` empty | Stage workflow missing `workflow_call.outputs`, or upstream job did not set job outputs. |
| CI fails "Stale generated workflow" | Recompile and commit `pipeline.generated.yml` after editing the pipeline. |
| YAML parse error on generated `name:` | Recompile with current pipeline-compose (emitter quotes automatically). |
| `context.foo.bar` not rewritten | Typo in stage id or output name; must match an earlier stage's `id` and declared `outputs`. |

---

## Related

- [README](../README.md) — Usage and scenarios (checkout-style)
- [pipeline.yml](../.github/pipelines/pipeline.yml) — live dogfood example
- [pipeline-runner template](../templates/pipeline-runner.yml)
- [pipeline v1 schema](../schema/pipeline-v1.schema.json)
