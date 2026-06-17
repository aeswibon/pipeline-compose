# pipeline-compose-eval

**Test the same conditions as pipeline `when:`** — inside any workflow, without running the full pipeline.

Optional helper. [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) already evaluates **`when:`** on each stage automatically.

Part of [pipeline-compose](https://github.com/aeswibon/pipeline-compose).

---

## Do I need this?

**Yes, if** you want to:

- Gate a **normal job** with pipeline-style rules (e.g. “only on tags”)  
- **Debug** a **`when:`** expression before adding it to the pipeline file  
- Reuse the **same syntax** outside the orchestrator

**No, if** all conditions live in pipeline **`when:`** fields and **run** handles everything.

---

## How it works

```text
expression + context + github  →  eval action  →  result: "true" | "false"
                                                      ↓
                                            if: steps.id.outputs.result == 'true'
```

Same expression language as stage **`when:`** in pipeline YAML.

---

## Quick start

**Only run deploy on version tags:**

```yaml
- id: gate
  uses: aeswibon/pipeline-compose-eval@v1.13.0
  with:
    expression: startsWith(github.ref, 'refs/tags/v')
    github: ${{ toJson(github) }}

- name: Deploy
  if: steps.gate.outputs.result == 'true'
  run: ./deploy.sh
```

**Match pipeline `when:` using context:**

```yaml
# In pipeline.yml:
#   when: context.ci.passed == 'true'

- id: gate
  uses: aeswibon/pipeline-compose-eval@v1.13.0
  with:
    expression: context.ci.passed == 'true'
    context: '{"ci":{"passed":"true"}}'
```

Example: [eval-conditional](https://github.com/aeswibon/pipeline-compose/tree/master/examples/eval-conditional).

<!-- start usage -->
```yaml
- uses: aeswibon/pipeline-compose-eval@v1.13.0
  with:
    expression: startsWith(github.ref, 'refs/tags/v')
```
<!-- end usage -->

---

## Glossary

| Term | Plain English |
|------|----------------|
| **`expression`** | The condition string (same as pipeline **`when:`**). |
| **`when`** (pipeline) | Stage field; skipped if expression is false. Eval lets you test it elsewhere. |
| **`context`** | JSON like run builds: `{ "stage-id": { "key": "value" } }`. Use **`context.stage-id.key`** in expressions. |
| **`github`** | JSON with at least **`ref`** (and anything else your expression reads). |
| **`result`** | Output: string **`true`** or **`false`** — compare in **`if:`** on next step. |

**Supported (typical):** `startsWith`, `contains`, `==`, `&&`, `||`, `!`, property access.  
**Not eval’s job:** artifacts, **`companion_workflows`**, dispatch — see **run** README.

---

## Common questions

**Difference from GitHub `if:`?**  
Syntax matches pipeline **`when:`**, not full GitHub Expressions. Keeps pipeline and custom jobs aligned.

**Run already has `when:` — why eval?**  
For jobs **outside** the pipeline (notifications, manual gates) or to test expressions in a PR check.

**`result` is a string?**  
Yes — use **`== 'true'`**, not boolean true.

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `expression` | yes | — | Condition to evaluate |
| `context` | no | `{}` | Pipeline-style context JSON |
| `github` | no | `{}` | GitHub context JSON |

## Outputs

| Output | Description |
|--------|-------------|
| `result` | **`true`** or **`false`** (string) |

---

## Related actions

| Action | Role |
|--------|------|
| [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) | Evaluates **`when:`** per stage automatically |

## License

[MIT](LICENSE)
