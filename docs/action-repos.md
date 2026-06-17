# Action repositories

Each GitHub Action is published from its **own repository** with `action.yml` at the repo root (required for GitHub Marketplace). Source for all actions lives in this monorepo under `packages/action-*`.

| GitHub repository | Monorepo package | Role |
|-------------------|------------------|------|
| [pipeline-compose-run](https://github.com/aeswibon/pipeline-compose-run) | `packages/action-run` | Primary runtime orchestrator |
| [pipeline-compose-export](https://github.com/aeswibon/pipeline-compose-export) | `packages/action-export` | Stage output artifact upload (Node 24) |
| [pipeline-compose-compile](https://github.com/aeswibon/pipeline-compose-compile) | `packages/action-compile` | Optional static workflow codegen |
| [pipeline-compose-eval](https://github.com/aeswibon/pipeline-compose-eval) | `packages/action-eval` | `when:` expression evaluation |
| [pipeline-compose-context-merge](https://github.com/aeswibon/pipeline-compose-context-merge) | `packages/action-context-merge` | Context merge helper (Node 24) |

This repo (**pipeline-compose**) is the single development surface: shared core, CLI, action sources, schema, docs, and release workflows.

## Publish from the monorepo

After changing action or core logic:

```bash
pnpm test
pnpm run build
pnpm run publish:actions v0.3.0
```

On **tag push**, CI runs this automatically as the final release stage (`publish-actions`) after the meta-repo GitHub Release is created.

### CI setup (one time)

Add a repository secret on **pipeline-compose**:

| Secret | Value |
|--------|--------|
| `ACTION_PUBLISH_TOKEN` | PAT with `contents: write` on `pipeline-compose-run`, `pipeline-compose-export`, `pipeline-compose-compile`, `pipeline-compose-eval`, and `pipeline-compose-context-merge` |

Fine-grained PAT: grant **Contents** read/write on each action repo. Classic PAT: `repo` scope works if you own all repos.

Manual publish (e.g. after a failed CI stage): [Actions → Publish actions → Run workflow](https://github.com/aeswibon/pipeline-compose/actions/workflows/publish-actions.yml) with the semver (no `v` prefix, e.g. `0.4.1`). The version must **not** already exist on the action repos — tags are **immutable**.

`scripts/publish-action-packages.sh` clones each action repo, copies `action.yml`, `README.md`, and bundled `dist/`, commits on **`master`** (append-only, no force push), creates a **new** tag once, and opens a GitHub Release with CHANGELOG-derived notes. Each commit message records the monorepo SHA it was built from.

Doc or README fixes ship as a **new patch release** (`0.4.1`, `0.4.2`, …): update the monorepo, add a `CHANGELOG` section, tag, and let CI publish. Do not republish an existing action tag.

Optional **use_master** only changes which monorepo commit is checked out before publish (master HEAD vs `v{version}`); it does **not** allow overwriting an existing action-repo tag.

Local publish uses SSH remotes when `GH_TOKEN` is unset; CI uses `GH_TOKEN` from the secret (HTTPS via `gh auth setup-git`).

Requires the [GitHub CLI](https://cli.github.com/) (`gh`) for local runs.

## Release notes

Action releases use the same root `CHANGELOG.md` as the meta repo. When you run `pnpm run publish:actions`, each action gets a GitHub Release whose body comes from `scripts/ci/render-action-release-notes.sh`.

### Per-action subsections (recommended)

Under each `## [X.Y.Z]` section, add a `###` heading named after the GitHub repo:

```markdown
## [0.3.0] - 2026-06-14

### Changed
- Monorepo refactor (meta repo summary)

### pipeline-compose-run
- Rebuilt bundle; fixes dispatch timeout handling

### pipeline-compose-compile
- Rebuilt bundle from shared core v0.3.0
```

`publish:actions` picks the matching `### pipeline-compose-run` block for that repo’s release. If a subsection is missing, the **full** `## [X.Y.Z]` section is used instead (fine when all actions ship the same changes).

Each action release also appends a footer linking to the meta-repo tag on GitHub.

### Local preview

```bash
bash scripts/ci/render-action-release-notes.sh 0.3.0 pipeline-compose-run /tmp/notes.md
cat /tmp/notes.md
```

The meta repo must already have a non-empty `## [0.3.0]` section (`require-changelog-section.sh`).

### Release notes only

Tags and publish commits are immutable. To fix release notes after ship, edit the GitHub Release manually:

```bash
bash scripts/ci/render-action-release-notes.sh 0.3.0 pipeline-compose-run notes.md
gh release edit v0.3.0 --repo aeswibon/pipeline-compose-run --notes-file notes.md
```

Do not move or recreate the tag — consumers pin `@v1.13.0` (or another semver tag) to that commit.

## GitHub Marketplace

Publish from each action repo’s **Releases** page (check **Publish this Action to the GitHub Marketplace**). Tags must exist on the action repo (`pnpm run publish:actions` creates them).

## Consumer refs

```yaml
uses: aeswibon/pipeline-compose-run@v1.13.0
```

| Action | Ref |
|--------|-----|
| Run | `aeswibon/pipeline-compose-run@…` |
| Compile | `aeswibon/pipeline-compose-compile@…` |
| Eval | `aeswibon/pipeline-compose-eval@…` |
| Context merge | `aeswibon/pipeline-compose-context-merge@…` |

### Migration from monorepo paths (v0.1.0)

```yaml
# before
uses: aeswibon/pipeline-compose/run@v1.0.0

# after
uses: aeswibon/pipeline-compose-run@v1.13.0
```

Legacy split with sibling directories (`../pipeline-compose-run`, etc.) is no longer used — edit and publish from this monorepo only.
