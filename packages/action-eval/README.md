# pipeline-compose-eval

**Evaluate pipeline `when:` expressions against GitHub and context JSON.**

Used by [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run); also useful in custom workflows. Part of [pipeline-compose](https://github.com/aeswibon/pipeline-compose).

## Start here — gate a job on ref or context

Run deploy only on version tags:

```yaml
- id: should-deploy
  uses: aeswibon/pipeline-compose-eval@v0.3.1
  with:
    expression: startsWith(github.ref, 'refs/tags/v')
    github: ${{ toJson(github) }}

- name: Deploy
  if: steps.should-deploy.outputs.result == 'true'
  run: ./deploy.sh
```

Gate on prior stage output:

```yaml
- id: should-publish
  uses: aeswibon/pipeline-compose-eval@v0.3.1
  with:
    expression: context.ci.passed == 'true'
    context: '{"ci":{"passed":"true"}}'
```

Full walkthrough: [examples/eval-conditional](https://github.com/aeswibon/pipeline-compose/tree/master/examples/eval-conditional).

<!-- start usage -->
```yaml
- uses: aeswibon/pipeline-compose-eval@v0.3.1
  with:
    expression: startsWith(github.ref, 'refs/tags/v')
    context: '{"ci":{"passed":"true"}}'
```
<!-- end usage -->

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

## Compare approaches

| Approach | Tradeoff |
|----------|----------|
| **Inline `if:` with bash** | Duplicates logic already in pipeline `when:` |
| **Reusable workflow inputs** | Verbose for simple ref/context gates |
| **pipeline-compose-run** | Evaluates `when:` per stage automatically |
| **pipeline-compose-eval** | Same expression language; use anywhere in a workflow |

## License

[MIT](LICENSE)
