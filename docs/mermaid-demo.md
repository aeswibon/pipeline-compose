# Mermaid pipeline diagrams

`validate --mermaid` prints a [Mermaid](https://mermaid.js.org/) flowchart of stage topology: one node per stage (id, group, optional cross-repo target) and edges from `needs:`.

On pull requests that change `.github/pipelines/**`, the [**Pipeline PR comment**](../.github/workflows/pipeline-pr-comment.yml) workflow posts the same diagram plus validate status and issues. Design rationale: [docs/design/12-validation-simulate-and-pr-bot.md](design/12-validation-simulate-and-pr-bot.md).

## Local CLI

From the repo root:

```bash
pnpm run validate .github/pipelines/pipeline.yml \
  --repo-root . --workflows --strict --mermaid
```

| Flag | Effect |
|------|--------|
| `--mermaid` | Print `flowchart TD` after validation |
| `--json` | JSON report instead of human text |
| `--json --mermaid` | JSON report with a `mermaid` field (single pass for PR bots) |
| `--workflows` | Resolve workflow files under `--repo-root` |
| `--strict` | Promote deprecation warnings to errors (matches CI) |

Exit code follows validation (errors or strict warnings), not whether Mermaid printed successfully. Mermaid is rendered from the parsed pipeline even when validate fails, as long as the YAML loads (schema + stage `needs:` must be valid).

### This repo’s release pipeline

```mermaid
flowchart TD
  ci["ci (release)"]
  version_sync["version-sync (release)"]
  release_publish["release-publish (release)"]
  publish_actions["publish-actions (release)"]
  ci --> version_sync
  version_sync --> release_publish
  release_publish --> publish_actions
```

Solid arrows (`-->`) come from explicit `needs:` in `.github/pipelines/pipeline.yml`. When a stage has no `needs:`, the renderer falls back to file order with dotted arrows (`-.->`).

When validate finds issues, the diagram annotates nodes:

| Style | Meaning |
|-------|---------|
| **Red node** (`❌ …`) | Validation error on that stage (e.g. missing workflow file) |
| **Amber node** (`⚠ blocked upstream`) | Stage depends on a broken upstream stage via `needs:` |

When a stage has multiple errors, the label shows the highest-priority root cause (e.g. **missing workflow file** before group/path mismatch).

Example (recorded from closed [PR #7](https://github.com/aeswibon/pipeline-compose/pull/7)):

```mermaid
flowchart TD
  ci["ci (release)"]
  broken_gate["broken-gate (release)<br/>❌ missing workflow file"]:::error
  version_sync["version-sync (release)<br/>⚠ blocked upstream"]:::blocked
  release_publish["release-publish (release)<br/>⚠ blocked upstream"]:::blocked
  publish_actions["publish-actions (release)<br/>⚠ blocked upstream"]:::blocked
  ci --> broken_gate
  broken_gate --> version_sync
  version_sync --> release_publish
  release_publish --> publish_actions
  classDef error fill:#ffebe9,stroke:#cf222e,stroke-width:2px,color:#1f2328
  classDef blocked fill:#fff8c5,stroke:#9a6700,stroke-width:2px,color:#1f2328
```

### Smaller example

```bash
pnpm run validate examples/run-tag-release/.github/pipelines/pipeline.yml \
  --repo-root examples/run-tag-release --mermaid
```

### Preview elsewhere

1. Copy the CLI output (from `flowchart TD` through the last edge).
2. Paste into [mermaid.live](https://mermaid.live), or wrap in a fenced block in any Markdown file GitHub renders.

## PR bot (GitHub)

Workflow: [`.github/workflows/pipeline-pr-comment.yml`](../.github/workflows/pipeline-pr-comment.yml)

**Triggers** on pull requests that change:

- `.github/pipelines/**`
- `packages/core/schema/**`

**Behavior:**

1. Runs one `validate --workflows --strict --json --mermaid --simulate` invocation.
2. Posts or updates a sticky PR comment (`<!-- pipeline-compose-pr-bot -->`) with status, the Mermaid diagram, and a bullet list of issues.

Updating the pipeline file on the same PR refreshes the existing comment (same marker), it does not spam new comments.

### Sample pull requests

These closed PRs smoke-tested the bot on this repo:

| PR | Scenario | What to look for |
|----|----------|------------------|
| [#5 — Test pipeline mermaid PR comment](https://github.com/aeswibon/pipeline-compose/pull/5) | Valid pipeline change | **Status: OK**, four-stage topology, _No issues._ |
| [#7 — Demo mermaid error styling on validation failure](https://github.com/aeswibon/pipeline-compose/pull/7) | Intentional break (`broken-gate` → missing workflow) | **Status: Failed**; red **`broken-gate`** node; amber **blocked upstream** on all downstream stages — see [bot comment](https://github.com/aeswibon/pipeline-compose/pull/7#issuecomment-4702508990) |

PR #7 also shows that **`Pipeline validate` CI can fail** while the PR comment job still completes and posts the annotated diagram.

Older [PR #6](https://github.com/aeswibon/pipeline-compose/pull/6) exercised the same break before error styling existed (topology only, no red/amber nodes).

**Break cases that still render Mermaid:** missing workflow files, deprecation/strict errors, group/path warnings promoted under `--strict`.

**Break cases that do not render Mermaid:** invalid YAML/schema, or unknown stage id in `needs:` (validate exits before topology render).

### Try it locally before opening a PR

```bash
git checkout -b test/mermaid-error-styling-demo
# Add broken-gate stage with a missing workflow (see PR #7 diff)
pnpm run validate .github/pipelines/pipeline.yml --repo-root . --workflows --strict --mermaid
git commit -am "test: demo mermaid error styling"
git push -u origin test/mermaid-error-styling-demo
gh pr create --title "Demo mermaid error styling" --body "Do not merge."
```

## See also

- [development.md](development.md) — local validate flags
- [glossary.md](glossary.md) — `validate --mermaid` entry
- [migration/v1.0.md](migration/v1.0.md) — 1.0 GA breaking changes
- [migration/v0.5.md](migration/v0.5.md) — pre-1.0 deprecation checklist (historical)
