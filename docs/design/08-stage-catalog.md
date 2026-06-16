# 08 — Stage catalog

**Series:** [Design rationale](README.md) · **Prev:** [07 — Sub-pipelines](07-sub-pipelines.md) · **Next:** [09 — Typed context schema](09-typed-context-schema.md)

**Shipped:** v1.5.0 · **Schema:** root `catalog:` + stage `use: <key>`

## Executive summary

The catalog is **DRY for stage rows** inside one pipeline file—templates with per-instance overrides. It is deliberately **not** a remote orb registry (yet): zero supply-chain surface, validate offline, prove merge semantics before hosting shared templates.

---

## Context

### Copy-paste drift

Without catalog, teams duplicate blocks:

```yaml
- id: build-api
  workflow: .github/workflows/build.yml
  outputs: [image]
  inputs: { target: api }
- id: build-web
  workflow: .github/workflows/build.yml
  outputs: [image]
  inputs: { target: web }
```

Reviews cannot see **what differs** from the template. Strict validate cannot know they “meant” the same thing.

### Roadmap pressure

[Product roadmap](../superpowers/specs/product-growth-roadmap.md) describes CircleCI-style remote catalogs (`workflow: org/catalog@v1`). That requires trust, versioning, and legal review. v1.5 ships the **merge engine** local-first.

---

## Decision

### Schema shape

```yaml
catalog:
  npm-build:
    workflow: .github/workflows/build.yml
    outputs: [version]
    # no id, no use

pipelines:
  release:
    stages:
      - id: build
        use: npm-build
        needs: [ci]
        inputs: { node: "24" }
```

**Catalog entry:** `PipelineStage` minus `id` and `use`. Must have `workflow` **or** `pipeline_file`, not both. Cannot reference `use`.

### Merge semantics (`mergeCatalogStage`)

```text
merged = { ...template, ...overrides, id: stage.id }
inputs:     template.inputs  overlaid by overrides.inputs
outputs:    overrides.outputs ?? template.outputs
needs:      overrides.needs ?? template.needs
```

**Design intent:**

| Field | Merge rule | Why |
|-------|------------|-----|
| `inputs` | Shallow merge | Per-instance parameters |
| `outputs` | Override replaces whole list | Avoid accidental key merge ambiguity |
| `needs` | Override replaces | Template default deps vs instance deps are explicit |
| `workflow` / `pipeline_file` | Forbidden on instance if `use` set | Single source of truth in catalog |

Expansion runs at **resolve** time (`expandCatalogStages` in `packages/core/src/compile/catalog.ts`). Runtime sees normal stages—no “catalog” concept in orchestrator.

### Validation codes

| Code | Meaning |
|------|---------|
| `catalog.unknown` | `use` references missing key |
| `catalog.conflict` | `use` + `workflow`/`pipeline_file` |
| `catalog.invalid-entry` | Template malformed or has `use` |
| `catalog.missing-id` | `use` without stage `id` |

`lenientCatalog` option (internal/tests) allows expansion despite errors—production validate uses strict path.

---

## Consequences

### Positive

- **Review clarity** — diff shows only overrides (`needs`, `inputs`).
- **No network** — validate works air-gapped.
- **Same orchestrator** — zero runtime branch for catalog.
- **Stepping stone** — remote catalog can be “fetch YAML + merge” later.

### Negative

- **File-local only** — no org-wide sharing without copy or future registry.
- **No template versioning** — catalog keys are not semver’d; git history is version.
- **Shallow input merge** — nested objects replace wholesale if you override `inputs` key-by-key at top level only.

### vs sub-pipeline

| Catalog | Sub-pipeline |
|---------|--------------|
| Reuse **one stage** | Reuse **whole graph** |
| Same pipeline file | Separate YAML file |
| `use: key` | `pipeline_file:` |

---

## Alternatives considered

| Approach | Verdict |
|----------|---------|
| **YAML anchors/merge keys** | Invisible to validator; poor error messages |
| **`init` codegen only** | One-shot; no single source of truth |
| **Remote URL import at validate** | SSRF/supply chain; deferred |
| **Separate shared repo without merge** | Sub-pipeline file already does this |
| **Inheritance chain (`extends`)** | Harder to reason than one-level overlay |

---

## Future: remote catalog (not shipped)

Expected properties when built:

- Pin `catalog_ref: org/templates@v2`
- Signature or org allowlist
- Validate offline with vendored snapshot in PR

v1.5 local catalog proves **merge rules** without operating a registry.

---

## Example

`examples/run-tag-release/.github/pipelines/pipeline.yml` — catalog + release stages.

---

## Revisit criteria

- Multiple teams request **shared template repo** with audit trail → ship remote fetch + pin.
- Shallow `inputs` merge insufficient → document deep merge or `inputs_patch` map (schema change).

---

## Code anchors

| Piece | Path |
|-------|------|
| Merge + validate | `packages/core/src/compile/catalog.ts` |
| Resolution hook | `packages/core/src/compile/pipeline-resolve.ts` |

---

## What to read next

- [07 — Sub-pipelines](07-sub-pipelines.md)  
- [09 — Typed context schema](09-typed-context-schema.md)  
- [11 — Deferred and rejected](11-deferred-and-rejected.md)
