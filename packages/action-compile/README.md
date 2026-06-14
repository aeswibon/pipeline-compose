# pipeline-compose-compile

**Compile pipeline YAML into a static GitHub Actions workflow with native `needs:` edges.**

Optional — most teams use [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) only (no generated file to commit). Part of [pipeline-compose](https://github.com/aeswibon/pipeline-compose).

## Start here — CI compile check

Keep a generated workflow in sync with your pipeline file:

```yaml
jobs:
  compile-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: aeswibon/pipeline-compose-compile@v0.3.3
        with:
          pipeline_file: .github/pipelines/pipeline.yml
          output: .github/workflows/pipeline-generated.yml
          workflow_output: .github/workflows/pipeline-generated.yml
          check: "true"
```

When `check: true`, the action fails if the committed workflow differs from what the pipeline compiles to.

Full walkthrough: [examples/compile-check](https://github.com/aeswibon/pipeline-compose/tree/master/examples/compile-check).

<!-- start usage -->
```yaml
- uses: aeswibon/pipeline-compose-compile@v0.3.3
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    output: .github/workflows/pipeline-generated.yml
```
<!-- end usage -->

## One-off generation

```yaml
- uses: aeswibon/pipeline-compose-compile@v0.3.3
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    output: .github/workflows/pipeline-generated.yml
```

### CLI equivalent

```bash
pnpm exec tsx packages/cli/src/main.ts compile .github/pipelines/pipeline.yml -o out.yml
```

(from the [pipeline-compose](https://github.com/aeswibon/pipeline-compose) monorepo)

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `pipeline_file` | yes | — | Path to pipeline YAML |
| `pipeline_inline` | no | `''` | Inline YAML override |
| `output` | no | — | Write generated workflow to this path |
| `workflow_output` | no | same as `output` | Path embedded in compile-check job |
| `compile_action` | no | `aeswibon/pipeline-compose-compile@master` | Action ref for compile-check job |
| `default_branch` | no | `master` | Branch in generated `on.push.branches` |
| `check` | no | `false` | Fail when output file differs |

## Outputs

| Output | Description |
|--------|-------------|
| `workflow_path` | Path written when `output` is set |
| `workflow_yaml` | Generated YAML when `output` is not set |

## Pipeline format

Same as the run action — see [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run#start-here--tag-release-pipeline).

## Compare approaches

| Approach | Tradeoff |
|----------|----------|
| **Hand-written `needs:` graph** | Full control; drifts from your pipeline YAML |
| **pipeline-compose-run** | No generated file; runtime orchestrator |
| **pipeline-compose-compile** | Single source pipeline YAML → committed workflow; CI drift check |

## License

[MIT](LICENSE)
