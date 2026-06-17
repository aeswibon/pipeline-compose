# 12 — Validation, simulate, and PR feedback

**Series:** [Design rationale](README.md) · **Prev:** [11 — Deferred and rejected](11-deferred-and-rejected.md) · **Next:** [13 — Meta release pipeline](13-meta-release-pipeline.md)

## Executive summary

**Validate is the product’s shift-left layer:** the same `packages/core` logic runs locally, in CI, and in the PR comment bot. We treat **stable issue codes**, **simulate parity with runtime**, and **mermaid as a review artifact** as semver contracts—not CLI sugar.

---

## Context

### Why orchestration products fail adoption

Teams fear editing pipeline YAML because:

1. **Graph is invisible** until a tag push fails at 2am.
2. **Errors are runtime-only** (empty dispatch input, missing workflow).
3. **Cross-repo stages** do not run on every PR in the driver repo.

Without validate, pipeline-compose would be “another YAML DSL with a long feedback loop.” The CLI exists **before** run is invoked.

### Personas

| Persona | Validate need |
|---------|----------------|
| **Stage author** | `workflow.missing`, export warnings before merge |
| **Pipeline editor** | `needs.unknown`, context wiring, mermaid for reviewers |
| **Platform** | `--strict` in CI, JSON for dashboards, stable codes |
| **Release on-call** | `--simulate` with realistic `github` payload |

---

## Decision

### Single report pipeline

```text
load + resolve pipeline (catalog, sub-pipeline expand)
  → collectPipelineIssues
  → collectNeedsIssues
  → collectContextIssues
  → collectContextSchemaIssues
  → collectDeprecationIssues (with repoRoot)
  → findOrphanWorkflows (with --workflows)
  → promote warns → errors if --strict
```

Entry: `buildValidateReport` in `packages/core/src/compile/validate-report.ts`. CLI and CI call the same function—no duplicate rules in the PR workflow script.

### Issue code taxonomy (stable)

Documented in [1.0 contracts](../specs/1.0-contracts.md). Categories:

| Category | Examples | Level default |
|----------|----------|---------------|
| **Graph** | `needs.unknown` | error |
| **Files** | `workflow.missing`, `workflow.orphan` | error / warn |
| **Wiring** | `context.unknown-stage`, `context.unknown-output` | error |
| **Schema** | `context-schema.*` | error |
| **Sub-pipeline** | `subpipeline.invalid`, `subpipeline.unknown-output` | error |
| **Cross-repo** | `stage.cross-repo`, `stage.cross-repo-token`, `repo.access-denied`, `repo.access-check-failed` | warn / error |
| **Hygiene** | `group.path-prefix`, `group.mixed` | warn |
| **Deprecations** | `uses.master-pin-deprecated`, `export.manual-upload-deprecated` | warn → error in strict |

**Strict mode** promotes **all** warnings to errors. Meta repo CI and `scripts/ci/validate-examples.sh` use `--strict` for every example except cross-repo dispatch (loose validate + example token file).

**PE implication:** adding a new warn is backward compatible; changing code meaning or demoting errors is semver-sensitive.

### `--workflows` and orphans

With `--repo-root` + `--workflows`, validate scans `.github/workflows/` and flags files not referenced by:

- any stage `workflow`
- nested sub-pipeline workflows (resolved)
- `companion_workflows` allowlist

**Why companions exist:** entry workflows (`release.yml`), PR bot, smoke tests are not stages but must not fail orphan detection. See meta pipeline [13](13-meta-release-pipeline.md).

### `--simulate` (dry-run)

`simulatePipeline` (`packages/core/src/compile/simulate.ts`) walks the **same waves** as runtime (`groupStagesIntoWaves`) and applies the **same skip rules**:

| Status | Meaning | Runtime equivalent |
|--------|---------|-------------------|
| `run` | Would dispatch | Dispatch + wait |
| `skip` | `when:` false | Skipped, in `skipped` set |
| `blocked` | Upstream skipped or missing context | Blocked downstream |

Simulate **does not** call GitHub. It merges **empty string** placeholders for declared outputs so downstream context refs can resolve in the table.

**Limits (documented):**

- Does not evaluate whether export step exists at runtime (static scan separate).
- Does not model smart rerun reuse.
- Sub-pipeline failure bubbles as `blocked` on parent.

Pass `--github '{"ref":"refs/tags/v1.0.0",...}'` to test tag-only `when:` expressions—PR bot passes full `toJson(github)`.

### `--mermaid`

Rendered from parsed pipeline + validation issues for node styling (error red, blocked amber). See [mermaid-demo.md](../mermaid-demo.md).

**Design choice:** mermaid prints even when validate fails, if YAML parses—reviewers still see topology while fixing errors.

### JSON report

`--json` emits machine-readable report + optional `simulation` array + optional `mermaid` when combined with `--mermaid`. Used by PR bot (single invocation).

---

## PR comment bot

Workflow: [`.github/workflows/pipeline-pr-comment.yml`](../../.github/workflows/pipeline-pr-comment.yml)

**Triggers:** PR changes to `.github/pipelines/**` or `packages/core/schema/**`.

**Posts:** mermaid topology, simulate table, issue list. Updates single comment via HTML marker `<!-- pipeline-compose-pr-bot -->`.

**Validate:** one CLI invocation with `--json --mermaid --simulate` (mermaid embedded in JSON report).

**Why not a GitHub App (yet):** workflow + `github-script` achieves 80% of roadmap “dry-run PR bot” without install surface—see [11](11-deferred-and-rejected.md).

**Permissions:** `pull-requests: write` only on this repo; no cross-repo scope.

---

## CI layout

| Job | What it proves |
|-----|----------------|
| `scripts/ci/validate-examples.sh` | Meta + all example pipelines (strict except cross-repo fixture) |
| `pipeline-pr-comment.yml` | Human-visible graph on pipeline PRs |
| Unit tests | `validate-report.test.ts`, `simulate.test.ts`, catalog/sub-pipeline issues |

**Intentional gap:** no live dispatch in validate CI ([05](05-monorepo-and-action-repos.md)).

---

## Consequences

### Positive

- **One brain** for local dev and CI—no “works on my laptop” for rules.
- **Reviewable DAG** in every pipeline PR (meta repo dogfoods itself).
- **Stable codes** for future dashboards and policy engines.

### Negative

- **False confidence:** simulate `run` ≠ stage workflow will succeed (only that orchestrator would dispatch).
- **Strict orphans** annoy repos with experimental workflows—use `companion_workflows` or fix references.
- **Dual CLI invoke** in PR bot (mermaid + json) — **resolved v1.14:** `--json --mermaid` embeds diagram in JSON.

---

## Alternatives considered

| Approach | Verdict |
|----------|---------|
| **Runtime-only validation** | Rejected — too late, too expensive |
| **JSON Schema only on pipeline file** | Insufficient — graph + filesystem checks needed |
| **actionlint only** | Does not understand `context.*` or catalog |
| **Separate simulate binary** | Rejected — same core module |
| **Block mermaid on errors** | Rejected — topology helps fix errors |

---

## Operations

```bash
# Local (matches meta CI)
pnpm run validate .github/pipelines/pipeline.yml \
  --repo-root . --workflows --strict

# Dry-run for a tag release
pnpm run validate .github/pipelines/pipeline.yml \
  --repo-root . --workflows --strict --simulate \
  --github '{"ref":"refs/tags/v1.6.0","event_name":"push"}'

# PR preview
pnpm run validate .github/pipelines/pipeline.yml \
  --repo-root . --workflows --strict --mermaid
```

Cross-repo token warnings locally:

```bash
pnpm run validate examples/cross-repo-dispatch/.github/pipelines/pipeline.yml \
  --repo-root examples/cross-repo-dispatch --workflows \
  --repo-tokens-file examples/cross-repo-dispatch/repo-tokens.example.json
```

---

## Revisit criteria

- ~~**Single CLI pass** outputs mermaid + json together (UX).~~ Shipped v1.14 (`mermaid` field in JSON report).
- **Simulate includes smart rerun** column when flag set.
- **Policy-as-code** layer maps issue codes to allow/deny per repo (platform request).

---

## Code anchors

| Piece | Path |
|-------|------|
| Report builder | `packages/core/src/compile/validate-report.ts` |
| Simulate | `packages/core/src/compile/simulate.ts` |
| CLI flags | `packages/cli/src/main.ts` |
| PR bot | `.github/workflows/pipeline-pr-comment.yml` |
| Example CI | `scripts/ci/validate-examples.sh` |

---

## What to read next

- [13 — Meta release pipeline](13-meta-release-pipeline.md) — dogfooding walkthrough  
- [03 — Context and export contract](03-context-and-export-contract.md)  
- [mermaid-demo.md](../mermaid-demo.md)
