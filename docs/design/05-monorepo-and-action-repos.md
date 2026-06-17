# 05 — Monorepo and action repos

**Series:** [Design rationale](README.md) · **Prev:** [04 — Run path vs compile path](04-run-path-vs-compile-path.md) · **Next:** [06 — Smart rerun](06-smart-rerun.md)

## Executive summary

Development happens in **one monorepo** (`pipeline-compose`); consumption happens via **immutable semver tags on five small action repositories**. Shared semantics live exclusively in `@aeswibon/pipeline-compose-core` so we never fix the same bug twice in run vs compile vs validate.

---

## Context

### GitHub Actions packaging rules

- Marketplace and `uses: owner/repo@ref` expect `action.yml` at **repository root**.
- Tags on a monorepo apply to **everything** in that repo—bad pin if only `packages/action-run` changed.
- Subpath actions (`uses: org/big-repo/path@ref`) encourage `@master` pins—we actively deprecate those in strict validate.

### Maintainer constraints

- Small team, ponytail posture: **one parser, one validator, one wave algorithm**.
- Release dogfoods pipeline-compose-run on tag push (meta pipeline is integration test in prod).

---

## Decision

### Package topology

```text
@aeswibon/pipeline-compose-core   ← semantics (no GitHub Actions runtime deps in hot paths)
@aeswibon/pipeline-compose-cli    ← thin wrapper for local/CI
action-* packages                 ← @actions/core, artifact client, fetch to GitHub API
```

Actions bundle with `@vercel/ncc` into `dist/` at publish time. Consumers never `pnpm install` core—they get a frozen bundle per tag.

### Publish pipeline

1. Merge to monorepo `master`.
2. Tag `vX.Y.Z` on meta repo.
3. Release workflow (itself compose-orchestrated) runs tests, validate, compile parity, bundle.
4. `publish-actions` pushes to each action repo: `action.yml`, `README.md`, `dist/`, **new immutable tag**.

**Append-only action repos:** no force-push; failed publish uses new patch version.

### Version coupling

- Meta repo version == action tag `vX.Y.Z` (convention).
- README stable pin (e.g. `@v1.13.0`) updated in docs/examples on release.
- `CHANGELOG.md` is **single source**; per-action release notes sliced by `### pipeline-compose-run` headings.

---

## Consequences

### Positive

| Benefit | Why it matters |
|---------|----------------|
| **Single PR for feature + tests + docs** | Atomic semver story |
| **Core unit tests without Actions runner** | Fast feedback |
| **Consumer pins are real semver** | Reproducible builds for enterprises |
| **Blast radius isolation** | Compromise of export action ≠ rewrite run |

### Negative

| Cost | Mitigation |
|------|------------|
| **Publish secret** (`ACTION_PUBLISH_TOKEN`) | Fine-grained PAT on action repos only |
| **Five repos to track** | Table in [action-repos.md](../action-repos.md); scripted publish |
| **Bundle size / ncc quirks** | Pin ncc; smoke `act:full` |
| **Doc drift on action READMEs** | Copied from monorepo on publish |

### Release blast radius

A core bug affects **all** actions on next publish. We require `pnpm test` + `pnpm run build` + act smoke before tag. Hotfix path: patch release, new tags all repos.

---

## CLI vs actions split

| Surface | Runs where | Secrets |
|---------|------------|---------|
| CLI | Dev laptop, PR CI | None for dispatch |
| Actions | GitHub-hosted | `GITHUB_TOKEN`, App key, PAT map |

**Validate in CI** uses CLI (`pnpm run validate --strict --workflows`) on examples + meta pipeline—same code path as local dev.

**Intentional gap:** CLI does not orchestrate live cross-repo dispatch in CI (flaky, costly). Orchestrator integration tested via unit tests + act smoke, not live multi-repo.

---

## Testing strategy (what we prove)

| Layer | Proves |
|-------|--------|
| Vitest (core) | Parser, waves, catalog merge, simulate, smart-rerun fingerprints |
| Vitest (action-run) | Orchestrator with mocked GitHub client |
| `examples/*` validate | Real YAML fixtures |
| Compile parity | CLI == action output |
| act smoke | Bundles start, basic commands |

**What we do not prove in CI:** live cross-org dispatch (needs real tokens and repos).

---

## Alternatives considered

| Model | Verdict |
|-------|---------|
| **Monorepo subpath only** | Rejected — pin hygiene, marketplace |
| **Separate repos per package without meta** | Rejected — coordination overhead explodes |
| **npm-only distribution** | Rejected — target users author YAML workflows, not Node apps |
| **Duplicate validate in each action** | Rejected early — core extraction |

---

## Operational notes for platform teams

- **Pin actions** to `@v1.x.y`, not `@master` or monorepo SHA.
- **Internal mirror:** mirror five action repos + meta; publish script is template for air-gapped copy.
- **Forks:** fork monorepo + run `publish:actions` to your org’s action names (script assumes repo name mapping).

---

## Revisit criteria

- GitHub allows **versioned subpath actions** with independent tags (platform change).
- Bundle maintenance exceeds benefit — could publish core as shared layer (still needs ncc or node20+ install step).
- Customers demand **single repo** for security scanning — might monolith actions at cost of marketplace layout.

---

## What to read next

- [docs/action-repos.md](../action-repos.md) — secrets, manual recovery  
- [docs/development.md](../development.md) — commands  
- [04 — Run path vs compile path](04-run-path-vs-compile-path.md)
