# pipeline-compose — Phase C → D → A Design

**Status:** Approved  
**Date:** 2026-06-14  
**Prerequisite:** Phase B complete (manga-cdc dogfood via run action)  
**Release target:** Single tag `v0.3.3` at end of Phase A  

---

## Summary

Harden cross-repo orchestration with explicit token mapping and hybrid E2E verification (Phase C), ship adoption docs and examples without Marketplace submission (Phase D), then release `v0.3.3` with ops polish and Marketplace listing (Phase A).

Execution model: **stacked phases on `master`, one public launch** — not incremental semver tags between C and D.

---

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Phase order | C → D → A |
| Cross-repo auth (now) | Pipeline-adjacent `repo_tokens_json` action input; default `github_token` for same repo |
| Cross-repo auth (later) | GitHub App — deferred to v0.4+ |
| E2E | Hybrid: mocks on every PR; manual `workflow_dispatch` smoke before tag |
| Phase D scope | Docs + examples only |
| Phase A scope | `v0.3.3` tag, Dependabot, CI/act polish, Marketplace |

---

## Phase C — Harden cross-repo orchestration

### Problem

Stages with `repo: owner/repo` require a token with `actions: write` (and read access to workflows/runs) on the **target** repository. `GITHUB_TOKEN` in repo A cannot dispatch workflows in repo B. Current implementation scopes API paths via `withRepo()` but always uses one token — insufficient for real cross-repo pipelines.

### Solution: `repo_tokens_json`

New optional input on **pipeline-compose-run**:

```yaml
- uses: aeswibon/pipeline-compose-run@v0.3.3
  with:
    pipeline_file: .github/pipelines/pipeline.yml
    github_token: ${{ github.token }}
    repo_tokens_json: >
      {"other-org/other-repo":"${{ secrets.REMOTE_DISPATCH_TOKEN }}"}
```

GitHub Actions resolves `${{ secrets.* }}` before the action receives the string. The action parses JSON into `Record<"owner/repo", token>`.

### Token resolution rules

1. Stage has no `repo` → use `github_token`.
2. Stage `repo` equals `GITHUB_REPOSITORY` (case-sensitive slug match) → use `github_token`.
3. Stage `repo` is external → require key in parsed map; **throw before dispatch** if missing.
4. Never log token values; error messages reference slug and input name only.

### Client cache

`clientForStage()` currently caches by `owner/repo`. Update cache key to include token identity (e.g. slug + stable hash prefix of token) so two stages hitting the same remote with different tokens do not share a client incorrectly.

### API error handling

When GitHub returns 403 on workflow list/dispatch in a cross-repo stage, wrap with remediation:

> Cross-repo dispatch to `owner/repo` failed (403). Ensure `repo_tokens_json` includes this slug and the token has `actions: write` on the target repository.

Same-repo 403 keeps existing generic message.

### Validation

- **Runtime:** missing map entry → fail before dispatch (orchestrator).
- **CLI validate (strict):** if any stage has `repo` ≠ inferred default repo (from `--repo-root` / env), emit **error** `stage.cross-repo-token` unless validate is run with a new optional flag `--repo-tokens-file` pointing at a JSON file for local checks.
- Keep existing `stage.cross-repo` **warn** when slug is valid but token mapping cannot be verified statically.

### Hybrid E2E

| Layer | Mechanism |
|-------|-----------|
| PR CI | Unit tests only (mock `fetch`, token resolver, orchestrator) |
| Manual smoke | `.github/workflows/smoke-cross-repo.yml` — `workflow_dispatch` only |

**Smoke workflow requirements:**

- Secret: `CROSS_REPO_SMOKE_TOKEN` (PAT with `actions: write` on target repo).
- Host repo: `aeswibon/pipeline-compose` (or dedicated smoke host repo).
- Target repo: `aeswibon/pipeline-compose-smoke-target` (callable workflow echoing outputs).
- Pipeline fixture under `.github/pipelines/smoke-cross-repo.yml` with one `repo:` stage.
- Document run steps in `docs/development.md`.
- **Not** added to required CI jobs on push.

### Reliability scope (in)

- Fail-fast missing token map.
- Actionable 403 messages.
- Client cache correctness with multiple tokens.

### Reliability scope (out)

- GitHub App tokens.
- Automatic retry/backoff for transient API errors.
- Per-stage timeout overrides (existing global timeout/poll remain).

---

## Phase D — Adoption (docs only)

### Deliverables

1. **`examples/cross-repo-dispatch/`** — copy-paste host workflow + target callable workflow + pipeline YAML using `repo:` and `repo_tokens_json`.
2. **`docs/tutorials/cross-repo-pipeline.md`** — PAT creation, fine-grained scopes, secret wiring, validate checklist, link to manual smoke.
3. **Case study section** — manga-cdc migration (`workflow_run` → run action): what changed, permissions, token map pattern. Add to tutorial or `docs/examples.md`.
4. **README refresh** — root README, `packages/action-run/README.md`, `docs/examples.md`: cross-repo section with `@v0.3.3` placeholders updated at release time via version-sync (do not bump locally until tag).
5. **`docs/development.md`** — manual smoke workflow, `repo_tokens_json` testing notes.

### Out of scope

- GitHub Marketplace submission.
- Org-wide pipeline catalog.
- New product features beyond docs/examples.

---

## Phase A — Ship v0.3.3

### Versioning

- All feature work lands on `master` at package version **0.3.2** until tag.
- Tag `v0.3.3` triggers existing CI: version-sync → GitHub Release → publish-actions.
- CHANGELOG: collapse `[Unreleased]` into `[0.3.3]` at tag time (not on feature commits).

### Release checklist

1. Manual cross-repo smoke workflow green.
2. `pnpm test` + `pnpm run test:coverage` green (CI authoritative).
3. `pnpm run act:full` green locally (optional but recommended).
4. Resolve **2 Dependabot alerts** on default branch.
5. Add **workflow-lint** step to `.github/act/workflows/full-smoke.yml` (mirror CI job).
6. Marketplace metadata review on action repos (branding, description, categories).
7. Push tag `v0.3.3`.

### CHANGELOG sections for 0.3.3

Include: Phase C (`repo_tokens_json`, 403 errors, smoke workflow), Phase D (docs/examples), plus existing unreleased items (cross-repo `repo:`, richer `when:`, validate `--json`, sync `--dry-run`, version check, coverage).

---

## Testing strategy

| Phase | Verification |
|-------|----------------|
| C | New unit tests; manual smoke before A |
| D | `pnpm run validate examples/cross-repo-dispatch/... --strict`; tutorial steps reproducible |
| A | Full CI + manual smoke + tag release pipeline |

---

## Future (explicitly deferred)

- GitHub App installation token helper.
- Org pipeline template catalog (original roadmap “Phase D” product).
- Live cross-repo job on every CI push.
- Incremental tags between C and D.

---

## File touch map (reference)

| Area | Primary files |
|------|----------------|
| Token input | `packages/action-run/action.yml`, `src/index.ts`, `src/inputs.ts` |
| Resolution | `packages/action-run/src/orchestrator.ts`, new `repo-tokens.ts` (if split) |
| API errors | `packages/action-run/src/github.ts` |
| Validate | `packages/core/src/compile/validate-report.ts`, `packages/cli/src/main.ts` |
| Smoke | `.github/workflows/smoke-cross-repo.yml`, `.github/pipelines/smoke-cross-repo.yml` |
| Docs | `docs/tutorials/`, `examples/cross-repo-dispatch/`, READMEs |
| Release | `CHANGELOG.md`, `.github/act/workflows/full-smoke.yml`, Dependabot PRs |
