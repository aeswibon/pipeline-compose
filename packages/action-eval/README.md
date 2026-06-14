# pipeline-compose-eval

Evaluate a pipeline-compose **`when:`** expression against GitHub and pipeline context JSON.

Used internally by [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run); exposed for custom workflows and testing.

<!-- start usage -->
```yaml
- uses: aeswibon/pipeline-compose-eval@v0.3.0
  with:
    expression: startsWith(github.ref, 'refs/tags/v')
    context: '{"ci":{"passed":"true"}}'
```
<!-- end usage -->

## Usage

```yaml
- id: eval
  uses: aeswibon/pipeline-compose-eval@v0.3.0
  with:
    expression: ${{ github.event_name == 'push' }}
    github: ${{ toJson(github) }}
    context: ${{ steps.load-context.outputs.json }}

- name: Deploy
  if: steps.eval.outputs.result == 'true'
  run: ./deploy.sh
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `expression` | yes | — | Expression to evaluate |
| `context` | no | `{}` | Pipeline context JSON |
| `github` | no | `{}` | GitHub context JSON subset |

## Outputs

| Output | Description |
|--------|-------------|
| `result` | Boolean result as string (`true` / `false`) |

## Supported expressions

Subset aligned with pipeline `when:` fields — e.g. `startsWith`, `endsWith`, `contains`, equality, `&&`, `||`, `!`, and property access on `github` and `context`.

## License

[MIT](LICENSE)
