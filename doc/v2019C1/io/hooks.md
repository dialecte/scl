---
description: SCL IO hooks for @dialecte/scl v2019C1 — one import session per file, two-pass UUID reference resolution during project.import, and the diagnostics it returns.
---

# IO Hooks

`createSclProject` wires SCL's hooks onto the `Project` instance automatically (its import session, given to core through `createImportSession`, alongside the record hooks, as one `DialecteHooks` object). Core creates one import session per file it imports, so what the session collects is that file's only. They run during `project.import` and `project.importFile` and are not user-configurable — this page documents what they do and what the output looks like.

For the general IO hooks API, see [Core IO hooks](https://dialecte.github.io/core/io/hooks).

## Purpose

SCL uses two kinds of references between elements:

- **Path attribute** — human-readable XPath-style string (e.g. `function="S1/Bay1/VL1/Fn1"`)
- **UUID attribute** — stable opaque identifier (e.g. `functionUuid="abc-123"`)

Existing SCL files usually only contain path attributes. The IO hooks resolve each path to a UUID during import so that the stored records always have both. This makes UUID-based lookups reliable without a separate migration step.

## UUID enforcement

The `uuid` is enforced by the **`afterStandardizedRecord`** record hook, which runs during standardization — for every UUID-capable element that lacks one, on **every** entry point (import, create, clone, update). It is fill-only: an existing `uuid` is never regenerated. During import, standardization runs **before** `beforeImportRecord`, so by the time the IO pass sees a record its `uuid` is already present.

## Two-pass pipeline

### Pass 1 — `beforeImportRecord`

Runs per record in document order, on the already-standardized record. For each record:

1. **Target indexing** — if the element is a _target_ (e.g. `Function`, `LNode`): its computed path is added to a `pathIndex` map (`path → uuid`), reading the `uuid` that standardization already set.
2. **Reference queuing** — if the element is a _reference_ (e.g. `FunctionRef`) and only the path attribute is present: a pending resolution is queued.

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

Runs once after all records of the file are stored. Each pending resolution is looked up in `pathIndex`:

```
"S1/Bay1/VL1/Fn1" → "abc-123"  ✓ resolved
```

Returns a batch of updates that the import pipeline applies atomically, and the diagnostics of the file:

```ts
{
	updates: [{ recordId: 'ref-id', attributes: [{ name: 'functionUuid', value: 'abc-123' }] }],
	diagnostics: []
}
```

The stored `FunctionRef` record ends up with both attributes:

```xml
<FunctionRef function="S1/Bay1/VL1/Fn1" functionUuid="abc-123" />
```

## Diagnostics

What the import has to say about a file comes back as diagnostics, beside the writes (a path written again from the element its uuid names, a naming made for an LNode, names rewritten from a path are also reported), on the file's entry: `entry.diagnostics` of `project.import(files)`, `diagnostics` of `project.importFile(file)` (`[]` when there is nothing to say). Each is a core `Diagnostic` with `source: 'scl'`; the codes are in `SCL_IMPORT_DIAGNOSTICS`, and their data in [errors](../api/errors#import-diagnostics).

| Code                           | Severity      | When                                                                                                                                                                               |
| ------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unresolved-reference`         | `warning`     | Path was present but no target with that path was found                                                                                                                            |
| `unsupported-xpath-reference`  | `warning`     | Path uses an XPath syntax not supported by the resolver                                                                                                                            |
| `incoherent-reference`         | `warning`     | The path (or the names, for an IED-section reference named by attributes) and the uuid of a reference name two different elements: the uuid wins, or the reference is left as read |
| `data-path-not-split`          | `warning`     | The path of an LNode a reference names could not be given the data-object name a data reference by uuid carries: the reference is left as read                                     |
| `incoherent-path-names`        | `information` | Names written from a path disagree with it: they are written again from the path                                                                                                   |
| `derived-specification-naming` | `information` | An LNode bound to an IED had no `LNodeSpecNaming`: one was made from the LN it is bound to                                                                                         |

## Specified naming of the logical nodes

The same pass notes every `LNode`, its `eIEC61850-6-100` `Private` and whether it holds an `LNodeSpecNaming`. At the end, each `LNode` without one gets one, placed in that `Private` (created when the `LNode` has none), with the rule of the record hooks (see [reference](../extensions/reference#automatic-coherence-record-hooks)).

An LNode bound to an IED that gets its naming this way is reported with a `derived-specification-naming` diagnostic.
