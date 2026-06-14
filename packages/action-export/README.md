# pipeline-compose-export

Upload stage outputs for [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) in one step — no manual `jq` or artifact wiring.

Part of [pipeline-compose](https://github.com/aeswibon/pipeline-compose).

## Usage

```yaml
- uses: aeswibon/pipeline-compose-export@v0.4.0
  with:
    stage_id: my-stage
    outputs: '{"version":"1.2.3","sha":"${{ github.sha }}"}'
```

Or build JSON from step outputs:

```yaml
- id: meta
  run: echo "version=1.2.3" >> "$GITHUB_OUTPUT"

- uses: aeswibon/pipeline-compose-export@v0.4.0
  with:
    stage_id: my-stage
    outputs: '{"version":"${{ steps.meta.outputs.version }}"}'
```

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `stage_id` | yes | Stage id from `pipeline.yml` |
| `outputs` | yes | JSON object matching pipeline `outputs:` keys |

## Artifact contract

Creates artifact **`pipeline-compose-<stage_id>`** containing `outputs.json`, matching the contract expected by **pipeline-compose-run**.

## Related actions

| Action | Role |
|--------|------|
| **pipeline-compose-run** | Orchestrates stages and reads exported artifacts |
| **pipeline-compose-export** | One-step export from a stage workflow |
| **pipeline-compose-context-merge** | Manual context merge for composite setups |
