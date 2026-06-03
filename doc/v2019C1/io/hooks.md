---
description: SCL IO hooks for @dialecte/scl v2019C1 — two-pass UUID reference resolution during project.import.
---

# IO Hooks

SCL v2019C1 registers IO hooks on `SCL_DIALECTE_CONFIG.io.hooks` automatically. They run during `project.import` and are not user-configurable — this page documents what they do and what the output looks like.

For the general IO hooks API, see [Core IO hooks](https://dialecte.github.io/core/io/hooks).

## Purpose

SCL uses two kinds of references between elements:

- **Path attribute** — human-readable XPath-style string (e.g. `function="S1/Bay1/VL1/Fn1"`)
- **UUID attribute** — stable opaque identifier (e.g. `functionUuid="abc-123"`)

Existing SCL files usually only contain path attributes. The IO hooks resolve each path to a UUID during import so that the stored records always have both. This makes UUID-based lookups reliable without a separate migration step.

## Two-pass pipeline

### Pass 1 — `beforeImportRecord`

Runs per record in document order. For each record:

1. **UUID ensure** — if the element type supports `uuid` and the attribute is absent, a new UUID is generated and attached before the record is stored.
2. **Target indexing** — if the element is a _target_ (e.g. `Function`, `LNode`): its computed path is added to a `pathIndex` map (`path → uuid`).
3. **Reference queuing** — if the element is a _reference_ (e.g. `FunctionRef`) and only the path attribute is present: a pending resolution is queued.

**Example — after processing these two records:**

```xml
<Function name="Fn1" uuid="abc-123" />   <!-- ancestry: S1 > Bay1 > VL1 -->
<FunctionRef function="S1/Bay1/VL1/Fn1" />
```

Internal state:

```
pathIndex          = { "S1/Bay1/VL1/Fn1": "abc-123" }
pendingResolutions = [{ recordId: "ref-id", uuidAttributeName: "functionUuid",
                        lookupKey: "S1/Bay1/VL1/Fn1" }]
```

### Pass 2 — `afterImport`

Runs once after all records are stored. Each pending resolution is looked up in `pathIndex`:

```
"S1/Bay1/VL1/Fn1" → "abc-123"  ✓ resolved
```

Returns a batch of updates that the import pipeline applies atomically:

```ts
{
	updates: [{ recordId: 'ref-id', attributes: [{ name: 'functionUuid', value: 'abc-123' }] }]
}
```

The stored `FunctionRef` record ends up with both attributes:

```xml
<FunctionRef function="S1/Bay1/VL1/Fn1" functionUuid="abc-123" />
```

## Warnings

Unresolvable paths (path not in index at end of import) produce `ImportWarning` entries instead of updates:

| Warning type                  | When                                                    |
| ----------------------------- | ------------------------------------------------------- |
| `unresolved-reference`        | Path was present but no target with that path was found |
| `unsupported-xpath-reference` | Path uses an XPath syntax not supported by the resolver |

Warnings are returned via `AfterImportResult.warnings` and are accessible after `project.import` completes if you inspect the database directly. Future: surface via the Document API.
