# Tutorial: Manual context with pipeline-compose-context-merge

Accumulate **stage outputs in a JSON file** when you are not using [pipeline-compose-run](../run-tag-release/) to orchestrate dispatches.

## What you get

A `.pipeline-context.json` file that grows as each step completes — same shape the run action uses internally (`context.<stage-id>.<key>`).

## 1. Copy the workflow

Copy `.github/workflows/manual-pipeline.yml`.

## 2. Merge after each logical stage

```yaml
- uses: aeswibon/pipeline-compose-context-merge@v1.10.0
  with:
    context_file: .pipeline-context.json
    stage_id: build
    outputs: ${{ toJson(steps.build.outputs) }}
```

## 3. Pass context to eval or later steps

Download the artifact in a downstream job, or cat the file in the same job for debugging.

## When to use run instead

[ pipeline-compose-run ](https://github.com/aeswibon/pipeline-compose-run) manages context automatically across dispatched workflows. Use **context-merge** only for composite/manual pipelines.

## Links

- [pipeline-compose-context-merge on Marketplace](https://github.com/marketplace/actions/pipeline-compose-context-merge)
