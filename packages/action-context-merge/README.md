# pipeline-compose-context-merge

**Merge stage outputs into pipeline context JSON for composite workflows.**

Helper for advanced setups; [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) manages context automatically when orchestrating stages. Part of [pipeline-compose](https://github.com/aeswibon/pipeline-compose).

## Start here — accumulate context across jobs

After a job finishes, merge its outputs into a shared context file for later steps or jobs:

```yaml
- name: Run tests
  id: ci
  run: echo "passed=true" >> "$GITHUB_OUTPUT"

- uses: aeswibon/pipeline-compose-context-merge@v0.3.2
  with:
    context_file: .pipeline-context.json
    stage_id: ci
    outputs: ${{ toJson(steps.ci.outputs) }}

- uses: aeswibon/pipeline-compose-context-merge@v0.3.2
  with:
    context_file: .pipeline-context.json
    stage_id: version-sync
    outputs: '{"version":"1.2.3"}'
```

The file is created if missing. Existing keys under other stage ids are preserved.

Full walkthrough: [examples/context-merge-manual](https://github.com/aeswibon/pipeline-compose/tree/master/examples/context-merge-manual).

<!-- start usage -->
```yaml
- uses: aeswibon/pipeline-compose-context-merge@v0.3.2
  with:
    context_file: .pipeline-context.json
    stage_id: ci
    outputs: '{"version":"1.2.3"}'
```
<!-- end usage -->

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `context_file` | yes | `pipeline-context.json` | Path to context JSON file |
| `stage_id` | yes | — | Stage id key under `context` |
| `outputs` | yes | — | JSON object of outputs to merge |

## Compare approaches

| Approach | Tradeoff |
|----------|----------|
| **Ad-hoc `jq` / Node scripts** | Easy to get wrong; no shared schema |
| **pipeline-compose-run** | Context handled across dispatched stages |
| **pipeline-compose-context-merge** | Explicit file merge for composite/manual pipelines |

## License

[MIT](LICENSE)
