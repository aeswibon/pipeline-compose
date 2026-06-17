# 09 — Typed context schema

**Series:** [Design rationale](README.md) · **Prev:** [08 — Stage catalog](08-stage-catalog.md) · **Next:** [10 — Cross-repo authentication](10-cross-repo-authentication.md)

**Shipped:** v1.4.0 · **Schema:** optional `context_schema` (JSON Schema object)

## Executive summary

`context_schema` brings **contract-first wiring** to pipeline YAML: validate that declared outputs and `context.*` references point at real schema paths **before merge**. Runtime stays stringly-typed; this is static analysis for CI, not a new data plane.

---

## Context

### Failure modes without schema

| Bug | When it hurts |
|-----|----------------|
| `context.verison-sync.version` typo | Release tag dispatch with empty version |
| Stage exports `tag` but downstream expects `version` | Silent wrong deploy |
| Library team removes output | Consumer pipeline still validates until run |

v1.3 added **structural** checks (`context.unknown-stage`, `context.unknown-output`) against the pipeline graph—not against a declared **type contract** shared across teams.

### Microservice analogy

Platform teams asked for “Repo A exposes semver string; Repo B consumes semver string” as documentable API—like OpenAPI between services, but for CI context.

---

## Decision

### Schema shape

Root must be JSON Schema `type: object` with **per-stage** properties:

```json
{
  "type": "object",
  "properties": {
    "version-sync": {
      "type": "object",
      "properties": {
        "version": { "type": "string", "pattern": "^v?[0-9]+\\.[0-9]+\\.[0-9]+$" },
        "skip_publish": { "type": "string" }
      }
    }
  }
}
```

Convention: top-level keys match **stage ids**; nested properties match **output keys**.

### What validate checks (`collectContextSchemaIssues`)

1. Schema compiles under Ajv (`strict: false` for forward compat with draft keywords).
2. Each stage’s `outputs:` keys exist under `properties.<stageId>.properties.<key>`.
3. Each `context.<stageId>.<key>` reference in any stage `inputs` resolves to a schema path (`parseContextInputRefs`).

**What validate does NOT check:**

- Runtime values match `type` / `pattern` unless export sets `validate_schema: true`.
- Stages without `outputs:` but mutating external state.
- Keys present in export but omitted from schema (allowed—schema is minimum contract).

### Validate-time and optional runtime

| Layer | Behavior |
|-------|----------|
| `validate --strict` | `collectContextSchemaIssues` — wiring + declared outputs vs schema paths |
| Export action (`validate_schema: true`) | `validateStageOutputsAgainstSchema` — Ajv on published JSON before artifact upload |

**Shipped runtime path:** v1.11+ export action with `context_schema_json` input (meta `version-sync` dogfoods semver pattern on `version`). Validate-time checks remain the default; runtime enforcement is opt-in per export step.

---

## Consequences

### Positive

- **PE-friendly artifact** — check into repo; review contract diff like code.
- **JSON Schema ecosystem** — reuse tooling, patterns, `pattern`, `enum`.
- **Opt-in** — simple pipelines skip schema entirely.

### Negative

- **Duplication** — `outputs:` list and schema must agree (validate links them).
- **Strings only at runtime** — `type: integer` in schema does not coerce dispatch inputs.
- **No codegen yet** — no TypeScript types generated from schema (manual discipline).

### Relationship to `outputs:`

| Mechanism | Role |
|-----------|------|
| `outputs:` | Runtime/export contract (keys required in artifact) |
| `context_schema` | Documentation + static validation of graph + types |

A stage can declare `outputs: [version]` without schema; adding schema is stricter CI when teams coordinate across repos.

---

## Alternatives considered

| Approach | Verdict |
|----------|---------|
| **Custom DSL** | Rejected — JSON Schema is standard; avoid new language |
| **Required for all pipelines** | Rejected — adoption friction |
| **Protobuf / Avro** | Heavy for YAML-centric Actions users |
| **Runtime validate in export action** | **Shipped** v1.11 — optional `validate_schema` + Ajv in export bundle |
| **Infer schema from export JSON** | Backwards; schema should lead for API-first teams |

---

## Adoption pattern

1. Start with `outputs:` + context ref validation (v1.3).
2. Add `context_schema` with `type: string` only (documentation).
3. Tighten with `pattern`, `enum`, `required` on stage objects as teams mature.
4. Optional: export action `validate_schema: true` on publish (**shipped** v1.11).

---

## Invariants

Validation codes (stable):

- `context-schema.invalid` — Ajv compile failed
- `context-schema.shape` — root not object
- `context-schema.unknown-output` — stage output not in schema
- `context-schema.unknown-ref` — input ref not in schema

---

## Revisit criteria

- Customers demand **runtime** enforcement with semver major on export action.
- Schema inference from pipeline becomes maintenance win — generate schema stub in `init`.
- Multi-file pipelines need **shared schema import** — `$ref` to external file (validate enhancement).

---

## Code anchors

| Piece | Path |
|-------|------|
| Schema validation | `packages/core/src/lib/context-schema.ts` |
| Export runtime validate | `packages/action-export/src/index.ts` |
| Context ref parse | `packages/core/src/lib/context-refs.ts` |

---

## What to read next

- [03 — Context and export contract](03-context-and-export-contract.md)  
- [10 — Cross-repo authentication](10-cross-repo-authentication.md)
