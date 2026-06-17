# Tutorial: Compile-check with pipeline-compose-compile

Generate a **static GitHub Actions workflow** from pipeline YAML and fail CI when the committed file drifts.

Use this when you want native GitHub `needs:` graphs and are OK checking in generated YAML.

## What you get

```text
.github/pipelines/pipeline.yml     ← source of truth (order + wiring)
.github/workflows/pipeline-generated.yml  ← generated runner (committed)
.github/workflows/compile-check.yml       ← fails PR if out of sync
```

## 1. Copy files

Copy this folder’s `.github/` into your repo.

## 2. Generate the workflow once

On your machine (or a one-off CI run without `check`):

```yaml
- uses: aeswibon/pipeline-compose-compile@v1.12.0
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    output: .github/workflows/pipeline-generated.yml
```

Commit `.github/workflows/pipeline-generated.yml`.

## 3. Enable drift detection

`compile-check.yml` runs on every PR with `check: "true"`. If someone edits the pipeline but forgets to regenerate, CI fails.

## 4. Edit the pipeline, not the graph

Change stage order in `.github/pipelines/pipeline.yml`, regenerate, commit both files.

## Run vs compile

| | **run** | **compile** (this example) |
|---|---------|----------------------------|
| Committed generated YAML | No | Yes |
| Runtime orchestrator | Yes | No (GitHub runs the graph) |
| Best for | Most teams | Teams that want native `needs:` in GitHub UI |

Prefer **run** unless you have a reason to commit the graph — see [run-tag-release](../run-tag-release/).

## Links

- [pipeline-compose-compile on Marketplace](https://github.com/marketplace/actions/pipeline-compose-compile)
- [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) — simpler default
