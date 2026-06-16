# 04 — Run path vs compile path

**Series:** [Design rationale](README.md) · **Prev:** [03 — Context and export contract](03-context-and-export-contract.md) · **Next:** [05 — Monorepo and action repos](05-monorepo-and-action-repos.md)

## Executive summary

**One semantic model, two deployment modes.** Run path optimizes for **cross-repo and low ceremony**; compile path optimizes for **auditability and native Actions UX** in single-repo graphs. Maintaining parity in CI is a deliberate cost—we refuse to let them diverge silently.

---

## Context

### Two buyer personas

| Persona | Priority |
|---------|----------|
| **Release engineer (multi-repo)** | Dispatch to `repo:`, rotate tokens, change pipeline without regenerating committed workflows |
| **Platform engineer (same repo)** | Branch protection on `.github/workflows/*.yml`, one run ID, no polling orchestrator job |

If we shipped only run, same-repo teams would ask “why not just `needs:`?” If we shipped only compile, cross-repo would stay in bash forever.

### Shared brain

Both paths consume:

- `packages/core` parser + resolver (catalog, sub-pipeline expansion)
- `groupStagesIntoWaves` for ordering
- Expression evaluator for `when:`
- Validation issue codes

**Compile** emits a workflow YAML whose jobs mirror waves/stages. **Run** executes that graph at runtime via API.

---

## Decision

### Run path (`pipeline-compose-run`)

**When:** any `repo:` stage, sub-pipelines with runtime nesting, smart rerun, or teams that want pipeline.yml as sole source of truth.

**Execution characteristics:**

- Entry workflow: typically one job running Node orchestrator.
- Stages: N workflow runs (billable separately).
- Context: artifacts ([03](03-context-and-export-contract.md)).
- Secrets: `repo_tokens_json` / GitHub App on run action.

### Compile path (`pipeline-compose-compile`)

**When:** entire graph same repo, compliance wants generated workflow in git, teams accept regenerate-on-change.

**Execution characteristics:**

- Entry workflow: multi-job with native `needs:`.
- Stages: still separate workflow files, invoked as jobs (codegen wraps dispatch or reusable pattern per generated output).
- Context: can use job `outputs` within generated workflow where codegen wires them.
- Cross-repo: **not** the primary design center—generated YAML cannot magically bypass GitHub auth.

Consult generated output in `packages/core` codegen tests for exact shape; compile pin tracks stable action version.

### Parity gate

CI enforces **CLI compile == action compile** on the meta pipeline. Drift is a release blocker.

**Why:** otherwise docs lie and adopters get different graphs depending on entrypoint—classic “two implementations” failure mode.

---

## Comparison matrix (for architecture review)

| Dimension | Run | Compile |
|-----------|-----|---------|
| Cross-repo `repo:` | First-class | Limited / not focus |
| Pipeline change without workflow commit | Yes | No — regen required |
| Single Actions run UI graph | No (orchestrator + stage runs) | Yes (generated jobs) |
| Orchestrator runner time | Whole pipeline | Minimal (job wrappers only) |
| Smart rerun | Yes | N/A (native re-run semantics) |
| Sub-pipeline | Runtime recursive | Validate-time expansion rules |
| `concurrency` in pipeline YAML | Enforced in run action | Emitted as native block |
| Debuggability for on-call | Stage runs isolated | One workflow trace |
| Supply chain | Pin `@v1.x` run action | Pin compile action + commit output |

---

## Consequences

### Choosing wrong path hurts

- **Compile-only for 5-repo release** → engineers reintroduce custom dispatch scripts for the 4 satellite repos (defeats product).
- **Run-only for regulated same-repo** → auditors ask why orchestration logic is not in committed YAML (political cost, not technical).

### Hybrid orgs

Possible but cognitively expensive: e.g. compile for CI graph, run for release. Document both modes in runbooks; prefer one team-wide standard.

---

## Alternatives considered

| Idea | Verdict |
|------|---------|
| **Run only, delete compile** | Loses same-repo enterprise adopters; compile is low marginal cost |
| **Compile generates run invocation** | Meta-indirection; harder audit |
| **Compile inlines all stage YAML into one file** | Explodes size; breaks team ownership boundaries |
| **Third mode: pure doc validate** | That is CLI `validate` — not execution |

---

## Migration between paths

**Compile → run:** add run step workflow; keep stage workflows; remove generated jobs gradually; introduce export if using context across dispatches.

**Run → compile:** run `compile`, commit output, change entry workflow to call generated file; drop long poll job; verify `when:` and `needs` parity with simulate table.

---

## Revisit criteria

- Compile codegen gains **first-class cross-repo** with supported GitHub auth patterns (e.g. official OIDC to cloud — still unlikely to replace App).
- Run path adds **checkpoint UI** so regulated teams accept dynamic orchestration.
- Parity tests become **more expensive than dual maintenance** — would collapse to one path with clear loser.

---

## What to read next

- [02 — Orchestration model](02-orchestration-model.md)  
- [05 — Monorepo and action repos](05-monorepo-and-action-repos.md)  
- [pipeline-compose-compile README](https://github.com/aeswibon/pipeline-compose-compile)
