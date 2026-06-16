# Tutorial: Conditional jobs with pipeline-compose-eval

Evaluate the same **`when:`** expression language used in pipeline YAML — directly in your workflow, without the run orchestrator.

## What you get

Deploy only on version tags; skip on branch pushes — using one reusable eval step instead of duplicating expression logic in bash.

## 1. Copy the workflow

Copy `.github/workflows/deploy-gate.yml` into your repo.

## 2. Customize the expression

```yaml
- uses: aeswibon/pipeline-compose-eval@v1.10.0
  with:
    expression: startsWith(github.ref, 'refs/tags/v')
    github: ${{ toJson(github) }}
```

Pass pipeline context when gating on prior stage data:

```yaml
with:
  expression: context.ci.passed == 'true'
  context: ${{ steps.load-context.outputs.json }}
```

## 3. Branch on the result

```yaml
- name: Deploy
  if: steps.eval.outputs.result == 'true'
  run: ./deploy.sh
```

## Same language as pipeline `when:`

Use eval in custom workflows; use `when:` in [pipeline YAML](../run-tag-release/.github/pipelines/pipeline.yml) when orchestrating with **run**.

## Links

- [pipeline-compose-eval on Marketplace](https://github.com/marketplace/actions/pipeline-compose-eval)
- [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) — orchestrates stages + `when:` automatically
