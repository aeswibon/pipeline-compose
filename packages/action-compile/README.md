# pipeline-compose-compile

**Generate a normal GitHub Actions workflow from pipeline YAML** — so reviewers see a standard `needs:` graph in git.

Optional alternative to [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run). Part of [pipeline-compose](https://github.com/aeswibon/pipeline-compose).

---

## Do I need this?

**Yes, if** your team wants:

- Pipeline YAML as the **source of truth**, but  
- A **committed** `.github/workflows/*.yml` with native job **`needs:`** (familiar to everyone)

**No, if** you use **pipeline-compose-run** (runtime dispatch, no generated file) — the common path for cross-repo orchestration.

You typically pick **run OR compile**, not both for the same pipeline.

---

## How it works

```text
.github/pipelines/pipeline.yml   (you edit this — order + stages)
              ↓
    pipeline-compose-compile
              ↓
.github/workflows/pipeline-generated.yml   (generated jobs + needs:)
              ↓
    GitHub runs the generated file like any workflow
```

With **`check: true`**, CI fails if someone edits the generated file without recompiling — keeps YAML in sync.

---

## First-time setup checklist

- [ ] Write **`.github/pipelines/pipeline.yml`** (same format as run)  
- [ ] Run compile once to create **output** workflow file  
- [ ] Commit **both** pipeline and generated workflow  
- [ ] Add CI job with **`check: true`** to prevent drift  
- [ ] Trigger remains on **generated** workflow (or wire triggers in pipeline / compile options)

---

## Quick start

**One-off generate:**

```yaml
- uses: aeswibon/pipeline-compose-compile@v0.4.1
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    output: .github/workflows/pipeline-generated.yml
```

**CI guard (recommended):**

```yaml
jobs:
  compile-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: aeswibon/pipeline-compose-compile@v0.4.1
        with:
          pipeline_file: .github/pipelines/pipeline.yml
          output: .github/workflows/pipeline-generated.yml
          workflow_output: .github/workflows/pipeline-generated.yml
          check: "true"
```

Example: [compile-check](https://github.com/aeswibon/pipeline-compose/tree/master/examples/compile-check).

<!-- start usage -->
```yaml
- uses: aeswibon/pipeline-compose-compile@v0.4.1
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    output: .github/workflows/pipeline-generated.yml
```
<!-- end usage -->

---

## Glossary

| Term | Plain English |
|------|----------------|
| **`pipeline_file`** | Input pipeline YAML (v1 or v2). |
| **`output`** | Where to write the generated workflow. |
| **`check`** | `true` = fail if file on disk ≠ freshly compiled (use in CI). |
| **Stage `id` / `needs`** | Become job ids and **`needs:`** in generated YAML. |
| **`when`** | Becomes job-level **`if:`** where supported. |

**Not used with compile:** **`companion_workflows`**, **export artifacts**, **`repo_tokens_json`** — those belong to the **run** dispatch model.

---

## Common questions

**Run vs compile?**  
| | **run** | **compile** |
|---|---------|-------------|
| Generated YAML in repo | No | Yes |
| Cross-repo stages | Built-in | Limited |
| Passing data between stages | Artifacts + **export** | Often same-workflow **`outputs`** |

**Do I need pipeline-compose-export with compile?**  
Usually **no** — generated workflow may use standard job outputs within one run. Export is for **run**’s cross-dispatch model.

**Forgot to recompile after editing pipeline?**  
CI with **`check: true`** catches it.

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `pipeline_file` | yes | — | Pipeline YAML path |
| `output` | no | — | Write path |
| `check` | no | `false` | Fail on drift |
| `default_branch` | no | `master` | Branch in generated `on.push` |

## Outputs

| Output | Description |
|--------|-------------|
| `workflow_path` | Path written |
| `workflow_yaml` | YAML string if no `output` file |

---

## Related actions

| Action | Role |
|--------|------|
| [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) | Runtime orchestrator (no codegen) |

## License

[MIT](LICENSE)
