# 10 — Cross-repo authentication

**Series:** [Design rationale](README.md) · **Prev:** [09 — Typed context schema](09-typed-context-schema.md) · **Next:** [11 — Deferred and rejected](11-deferred-and-rejected.md)

**Shipped:** v1.6.0 (GitHub App) · **Earlier:** `repo_tokens_json` PAT map

## Executive summary

Cross-repo dispatch is an **authorization problem** dressed as CI. We support **explicit PAT maps** for day-one adoption and **GitHub App installation tokens** for compliance-friendly rotation—resolved per stage with PAT-first fallback to App, never the reverse.

---

## Context

### Token physics

`GITHUB_TOKEN` in repo A **cannot** dispatch `workflow_dispatch` in repo B. GitHub enforces repo boundary at the token.

Each `repo:` stage needs a credential that:

- Has access to **target** repository
- Includes permission to **trigger workflows** (Actions write / custom app permission)
- Is **scoped** so compromise of one pipeline does not mean org-wide admin

### Enterprise objections to PAT map

| Objection | App response |
|-----------|--------------|
| Long-lived secrets | Installation tokens ~1 hour |
| Bot user accounts | Service identity as App |
| Audit | Installation + app logs |
| Rotation | Key roll on app; no per-repo PAT sprawl |

We still ship PAT map because **many teams already have** automation PATs and need a migration runway.

---

## Decision

### Resolution order (`clientForStage`)

```text
if stage.repo is empty or same as entry repo:
  use GITHUB_TOKEN
else:
  try repo_tokens_json[slug]
  on miss → GitHubAppTokenProvider.tokenForRepo(owner, repo)
  if no App configured → throw with clear slug error
```

**PAT-first** respects explicit operator override (debugging, least-scope PAT for one repo). **App fallback** avoids N PAT secrets when org standardizes on App.

### PAT map (`repo_tokens_json`)

- JSON object: `"owner/repo": "ghp_..."`.
- Parsed at action start (`parseRepoTokensJson`); invalid JSON fails fast.
- Keys must match `stage.repo` slug **exactly**.

**Operational guidance:** fine-grained PAT per target repo; never commit map to git—GitHub secret only.

### GitHub App (`GitHubAppTokenProvider`)

Inputs: `github_app_id`, `github_app_private_key` (PEM in secret).

Flow per target repo:

1. Mint JWT (`RS256`, `iss` = app id, ~9 min exp).
2. `GET /repos/{owner}/{repo}/installation`
3. `POST /app/installations/{id}/access_tokens`
4. Cache token until `expires_at` minus 60s skew.

**In-process cache only** (`Map<owner/repo, token>`)—no cross-workflow cache (ponytail). Long pipelines refresh transparently.

### Per-repo API clients

`GitHubActionsClient` instances cached by `owner/repo#tokenPrefix` so polling does not recreate clients or re-auth unnecessarily.

**Same-repo optimization:** if `repo:` points at entry repo, still use default `GITHUB_TOKEN` client.

---

## Security properties

| Property | Status |
|----------|--------|
| Private key in logs | Never logged |
| Tokens in `outputs.json` | Forbidden by operator policy—not enforced in code |
| Token passed to stage workflows | **No** — token stays in orchestrator; stages use their own `GITHUB_TOKEN` |
| Installation not found | Hard fail at dispatch with API error text |

**Trust model:** orchestrator secret holders can dispatch any stage listed in pipeline YAML—**pipeline YAML is trust boundary**. Protect who can merge pipeline files.

### Compliance talking points

- App uses **installation-scoped** tokens, not user OAuth.
- PAT map is **bring-your-own** legacy; security review can require App-only via policy (omit PAT map).
- Cross-repo **artifact read** uses same token that dispatched—target repo must allow app/PAT to read run artifacts.

---

## Consequences

### Positive

- **Single run action config** for many targets.
- **Clear error** when slug missing from map and no App.
- **v1.0 → v1.6 migration** without breaking PAT users.

### Negative

| Cost | Detail |
|------|--------|
| App install ops | Each target repo must install app |
| Permission tuning | App needs Actions/workflow dispatch permission |
| No marketplace App yet | Operators create/register own app (BYO) |
| Enterprise Server | `GITHUB_API_URL` supported; test against your GHES version |

### What v1.6 is NOT

- Official **pipeline-compose** marketplace App with one-click install ([11](11-deferred-and-rejected.md))
- OIDC cloud federation (AWS/GCP) — different use case
- Automatic repo discovery — pipeline must list `repo:` explicitly

---

## Alternatives considered

| Approach | Verdict |
|----------|---------|
| **App only (break PAT)** | Rejected — migration cliff |
| **GITHUB_TOKEN with elevated org secret** | Does not cross repos |
| **Store tokens in pipeline YAML** | Never |
| **repository_dispatch without token** | Wrong direction; still need auth |
| **Central broker service** | Infra we refused in v1 |

---

## Operations playbook

| Error | Action |
|-------|--------|
| `no entry for that slug` | Add PAT key or App install on target |
| `403` on dispatch | App missing `actions: write` or workflow not `workflow_dispatch` |
| `404 installation` | App not installed on target org/repo |
| Works in repo A, fails B | Per-repo installation or PAT entry |

Tutorial: [cross-repo-pipeline.md](../tutorials/cross-repo-pipeline.md).

---

## Revisit criteria

- Ship **first-party GitHub App** with documented permissions matrix.
- GitHub releases **OIDC token for cross-repo workflow dispatch** (platform change).
- Customers need **workload identity per stage** — may need stage-level `permissions` in schema.

---

## Code anchors

| Piece | Path |
|-------|------|
| PAT parse/resolve | `packages/action-run/src/repo-tokens.ts` |
| App JWT + cache | `packages/action-run/src/github-app.ts` |
| Client selection | `packages/action-run/src/orchestrator.ts` (`clientForStage`) |

---

## What to read next

- [02 — Orchestration model](02-orchestration-model.md)  
- [11 — Deferred and rejected](11-deferred-and-rejected.md)
