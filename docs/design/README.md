# Design rationale series

This series explains **why** pipeline-compose is shaped the way it is: the problems it targets, the architecture we chose, what we shipped in each release, and what we deliberately did **not** build (yet).

It complements tutorials and reference docs. Read tutorials when you want steps; read this series when you want **judgment calls, invariants, and tradeoffs**—the material you would expect in an internal architecture review or ADR packet.

## Audience

| Reader | Use this series to… |
|--------|---------------------|
| **Staff / principal engineer** | Decide adopt vs build vs buy; challenge assumptions; plan org rollout |
| **Senior developer** | Understand non-obvious constraints (artifacts, dispatch, token model) before extending the system |
| **Platform / DevEx owner** | Estimate operational cost, security posture, and migration from `repository_dispatch` scripts |
| **Contributor** | Find intentional shortcuts (`ponytail:`) and the upgrade path before “fixing” them |

Each part follows a consistent shape where useful:

- **Context** — forces and constraints at decision time  
- **Decision** — what we built  
- **Consequences** — what you gain and what you pay  
- **Invariants** — contracts we treat as semver-sensitive  
- **Operations** — how this behaves in production CI  
- **Revisit criteria** — what evidence would change the decision  

## How to read

| Part | Topic | Deep dive |
|------|--------|-----------|
| [01 — Problem and approach](01-problem-and-approach.md) | Positioning | Build vs buy, incremental adoption on Actions, non-goals |
| [02 — Orchestration model](02-orchestration-model.md) | Runtime | Dispatch/poll loop, waves, skip semantics, concurrency enforcement |
| [03 — Context and export contract](03-context-and-export-contract.md) | Data flow | API gaps, artifact bridge, defense-in-depth validation |
| [04 — Run path vs compile path](04-run-path-vs-compile-path.md) | Two modes | Auditability vs cross-repo; parity CI |
| [05 — Monorepo and action repos](05-monorepo-and-action-repos.md) | Packaging | Immutable tags, core/action split, release blast radius |
| [06 — Smart rerun](06-smart-rerun.md) | v1.4 | Fingerprint model, attempt-scoped state, CI cost |
| [07 — Sub-pipelines](07-sub-pipelines.md) | v1.4 | Composition without new runtime; nesting cap |
| [08 — Stage catalog](08-stage-catalog.md) | v1.5 | DRY without remote supply chain (yet) |
| [09 — Typed context schema](09-typed-context-schema.md) | v1.4 | Validate-time contracts; why not runtime types |
| [10 — Cross-repo authentication](10-cross-repo-authentication.md) | v1.6 | PAT vs App, token resolution order, compliance |
| [11 — Deferred and rejected](11-deferred-and-rejected.md) | Roadmap | Explicit non-bets; how to propose changes |
| [12 — Validation, simulate, and PR bot](12-validation-simulate-and-pr-bot.md) | Shift-left | Stable issue codes, dry-run parity, PR comment workflow |
| [13 — Meta release pipeline](13-meta-release-pipeline.md) | Dogfooding | How this repo releases itself; maps series to real files |

## Related docs

- [Glossary](../glossary.md) — terms and contracts  
- [1.0 contracts](../specs/1.0-contracts.md) — semver-stable public API  
- [Tutorials](../tutorials/) — hands-on setup  
- [CHANGELOG](../../CHANGELOG.md) — what shipped when  

Start with [01](01-problem-and-approach.md) for the executive framing, or jump to the feature part that matches your review (e.g. [10](10-cross-repo-authentication.md) for security review).
