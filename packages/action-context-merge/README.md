# pipeline-compose-context-merge

Composite action: merge a stage’s outputs into a pipeline context JSON file on disk.

Helper for advanced workflows; [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) manages context automatically when orchestrating stages.

<!-- start usage -->
```yaml
- uses: aeswibon/pipeline-compose-context-merge@v0.3.0
  with:
    context_file: .pipeline-context.json
    stage_id: ci
    outputs: '{"version":"1.2.3"}'
```
<!-- end usage -->

## Usage

```yaml
- uses: aeswibon/pipeline-compose-context-merge@v0.3.0
  with:
    context_file: .pipeline-context.json
    stage_id: version-sync
    outputs: ${{ toJson(steps.sync.outputs) }}
```

The file is created if missing. Existing keys under other stage ids are preserved.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `context_file` | yes | `pipeline-context.json` | Path to context JSON file |
| `stage_id` | yes | — | Stage id key under `context` |
| `outputs` | yes | — | JSON object of outputs to merge |

## License

[MIT](LICENSE)
