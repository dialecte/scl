---
description: Reference extension for @dialecte/scl v2019C1 -- path building, resolution, and reverse-lookup for SCL reference elements.
---

# Reference

The `reference` module provides functions for working with SCL reference paths: query functions across **building** paths (write side), **resolving** them (read side) and one **reverse-lookup**, plus a **transaction** helper for remapping DataTypeTemplates type-id references.

```ts
import { reference } from '@dialecte/scl/v2019C1'
```

## Overview

```
buildElementPath     <->  resolveElementPath    (element <-> canonical path string)
buildReferencePath   <->  resolveReferencePath   (REF attr value <-> target record)
                          findRefsPointingTo     (reverse: target -> all REF records)
buildMappedLNodePath <->  resolveMappedLNode     (mapped LNode <-> implementing LN)
```

| Function               | Direction | Input                                | Output                                                   | Use when                                                      |
| ---------------------- | --------- | ------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------- |
| `buildElementPath`     | write     | `ref`                                | `ElementPath` (path string + segment-to-element mapping) | computing the path _to_ an element from its ancestry          |
| `buildReferencePath`   | write     | `reference` (REF element) + `target` | path value to store on the REF attribute                 | updating a REF element to point at a new target               |
| `resolveElementPath`   | read      | raw path string                      | `TrackedRecord`                                          | inverse of `buildElementPath` -- walk tree by path string     |
| `resolveReferencePath` | read      | REF record + path attribute name     | `{ record, qualifier }`                                  | inverse of `buildReferencePath` -- follow a REF to its target |
| `findRefsPointingTo`   | reverse   | target ref + optional container      | `ResolvedReference[]`                                    | find all REF records pointing to a given element              |
| `buildMappedLNodePath` | write     | mapped `LNode` attributes            | IED-section path string (or `null` when unmapped)        | computing the path to the IED `LN` that implements an `LNode` |
| `resolveMappedLNode`   | read      | `LNode` record                       | `TrackedRecord` (`LN`/`LN0`)                             | resolving a mapped `LNode` to its implementing IED `LN`       |

### Name distinctions

- **`buildElementPath`** vs **`buildReferencePath`** -- element path is the canonical address of an element; reference path is the value stored on a REF attribute (which may include a qualifier, e.g. `.Pos.stVal`).
- **`resolveReferencePath`** vs **`resolveElementPath`** -- `resolveReferencePath` follows a REF record's stored attribute; `resolveElementPath` walks the tree directly from a raw string.
- **`findRefsPointingTo`** vs **`resolveReferencePath`** -- `resolveReferencePath(ref)` gives you the target _of_ one ref; `findRefsPointingTo(target)` gives you all refs _pointing at_ a target. Opposite direction.
- **`resolveMappedLNode`** vs **`resolveElementPath`** -- a mapped `LNode` has no path attribute pointing to its `LN`; the implementing identity is spread across `iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst`. `resolveMappedLNode` composes the IED-section path from those attributes (via `buildMappedLNodePath`) and resolves it with `resolveElementPath`.

---

## buildElementPath

Computes the canonical path for any element from its ancestry chain. Returns an `ElementPath` containing the path string and a per-segment mapping back to the source element.

```ts
reference.query.buildElementPath(
  query: Scl.Query,
  ref: Scl.Ref<Scl.ElementsOf>,
): Promise<ElementPath | null>
```

### Return type

```ts
type ElementPath = {
	path: string // canonical path string, e.g. "S1/V1/B1/Protection"
	segments: PathSegmentWithRef[] // one entry per path segment
}

type PathSegmentWithRef = {
	segment: string // e.g. "S1", "Protection"
	separator: '/' | '.'
	ref: AnyRef // { tagName, id } of the element that produced this segment
}
```

```ts
const result = await reference.query.buildElementPath(query, { tagName: 'Function', id: 'func-1' })
// result.path -> "TEMPLATE/V1/B1/Protection"
// result.segments -> [
//   { segment: 'TEMPLATE', separator: '/', ref: { tagName: 'Substation', id: '...' } },
//   { segment: 'V1',       separator: '/', ref: { tagName: 'VoltageLevel', id: '...' } },
//   { segment: 'B1',       separator: '/', ref: { tagName: 'Bay', id: '...' } },
//   { segment: 'Protection', separator: '/', ref: { tagName: 'Function', id: 'func-1' } },
// ]
```

Returns `null` if the record is not found. The path is built by concatenating each ancestor's path segment (typically the `name` attribute) with `/`.

### Path segment rules

Most elements contribute their `name` attribute as segment. Special cases:

| Element    | Segment format                            | Example                   |
| ---------- | ----------------------------------------- | ------------------------- |
| LNode/LN   | `prefix` + `lnClass` + `inst`             | `PXCBR1`, `LLN0`          |
| LDevice    | `inst` attribute                          | `LD0`                     |
| SourceRef  | `input` + optional `(inputInst)` + `.pDA` | `Trip`, `Trip(2).general` |
| ControlRef | `output` + optional `(outputInst)`        | `TripCmd`, `TripCmd(2)`   |
| ExtRef     | `intAddr` attribute                       | `TrCmd.stVal`             |

**SourceRef/ControlRef disambiguation** (per IEC TR 61850-90-30, XSD identity constraints):

- `(inputInst)` is appended when `inputInst` is present and != `"1"` (the XSD default)
- `.pDA` is appended when `pDA` is non-empty
- `(outputInst)` follows the same rule for ControlRef

```ts
// SourceRef with input="Trip", inputInst="1", pDA=""  ->  "Trip"
// SourceRef with input="Trip", inputInst="2", pDA=""  ->  "Trip(2)"
// SourceRef with input="Trip", inputInst="1", pDA="general"  ->  "Trip.general"
// SourceRef with input="Trip", inputInst="2", pDA="general"  ->  "Trip(2).general"
```

---

## buildReferencePath

Builds the path value to store on a REF element's path attribute when pointing at a given target.

```ts
reference.query.buildReferencePath(
  query: Scl.Query,
  params: {
    reference: Scl.Ref<Scl.ElementsOf>   // the REF element
    target: Scl.Ref<Scl.ElementsOf>      // the element it points to
  },
): Promise<string | null>
```

```ts
// Update a FunctionRef to point at a new Function
const path = await reference.query.buildReferencePath(query, {
	reference: { tagName: 'FunctionRef', id: 'fref-1' },
	target: { tagName: 'Function', id: 'func-1' },
})
// -> "TEMPLATE/V1/Protection"

// For lnode resolution, the DO/DA qualifier comes from the companion names
const path = await reference.query.buildReferencePath(query, {
	reference: { tagName: 'SourceRef', id: 'sref-1' },
	target: { tagName: 'LNode', id: 'lnode-1' },
})
// -> "TEMPLATE/V1/B1/PXCBR1.Pos.stVal"  (qualifier from sourceDoName/sourceDaName)
```

Derives the resolution strategy from `UUID_REFERENCE_PAIRS` using the reference and target tag names. Returns `null` if no pair matches or the path is unresolvable.

Element-specific behaviour:

- **lnode** refs (`SourceRef`, `ControlRef`, `ProcessEcho`, `LNodeDataRef`): the DO/DA qualifier is taken from the companion `*DoName`/`*DaName` attributes when the stored path already carries one; a path that stops at the LN level stays companions-only.
- **mapped-name** refs (`DOS`/`SDS`/`DAS`): returns `null` — `mappedDoName`/`mappedDaName` is authored documentation produced by the hooks (see [Automatic coherence](#automatic-coherence-record-hooks)), not a rebuildable path.

---

## resolveElementPath

Resolves a canonical SCL path string to the record it points to. Inverse of `buildElementPath`.

```ts
reference.query.resolveElementPath(
  query: Scl.Query | Scl.Transaction,
  path: string,
): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined>
```

```ts
const record = await reference.query.resolveElementPath(query, 'TEMPLATE/V1/B1/CE1')
// -> TrackedRecord for ConductingEquipment name="CE1"
```

Walks the tree from root, matching each path segment against children. Transparent elements (`AccessPoint`, `Server`) are traversed automatically -- they don't appear in the path but are crossed during tree walk.

---

## buildMappedLNodePath

Composes the canonical IED-section path of the `LN` that implements a mapped `LNode`, from the LNode's implementation attributes.

```ts
reference.query.buildMappedLNodePath(
  attrs: MappedLNodeAttributes,
): string | null
```

```ts
type MappedLNodeAttributes = {
	iedName?: string
	ldInst?: string
	prefix?: string
	lnClass?: string
	lnInst?: string
}
```

```ts
reference.query.buildMappedLNodePath({
	iedName: 'IED1',
	ldInst: 'LD0',
	prefix: '',
	lnClass: 'XCBR',
	lnInst: '1',
})
// -> "IED1/LD0/XCBR1"
```

A mapped `LNode` carries the identity of the IED `LN` that implements it. Returns `null` for an unmapped `LNode` (`iedName="None"` or missing) or when `ldInst`/`lnClass` are absent. The LN segment is `prefix + lnClass + lnInst`.

---

## resolveMappedLNode

Resolves a mapped `LNode` to the IED `LN` (or `LN0`) that implements it. Inverse of `buildMappedLNodePath` paired with `resolveElementPath`.

```ts
reference.query.resolveMappedLNode(
  query: Scl.Query | Scl.Transaction,
  lnode: Scl.TrackedRecord<'LNode'>,
): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined>
```

```ts
const ln = await reference.query.resolveMappedLNode(query, lnodeRecord)
// -> TrackedRecord for the implementing LN, or undefined
```

Reads `iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst` from the LNode, composes the IED-section path via `buildMappedLNodePath`, then resolves it with `resolveElementPath`. Returns `undefined` for unmapped LNodes or when the path does not resolve to an `LN`/`LN0`.

---

## resolveReferencePath

Resolves a REF record's path attribute to the target record. Inverse of `buildReferencePath`.

```ts
reference.query.resolveReferencePath(
  query: Scl.Query | Scl.Transaction,
  record: Scl.TrackedRecord<Scl.ElementsOf>,
  pathAttribute: string,
): Promise<{ record: Scl.TrackedRecord<Scl.ElementsOf>; qualifier?: string } | undefined>
```

```ts
// Direct resolution: FunctionRef -> Function
const result = await reference.query.resolveReferencePath(query, functionRefRecord, 'function')
// -> { record: <Function "Protection"> }

// LNode resolution with qualifier: SourceRef -> LNode + DO/DA
const result = await reference.query.resolveReferencePath(query, sourceRefRecord, 'source')
// -> { record: <LNode PXCBR1>, qualifier: "Pos.stVal" }

// BehaviorDescription resolution: InputVar -> SourceRef (via UUID)
const result = await reference.query.resolveReferencePath(query, inputVarRecord, 'inputName')
// -> { record: <SourceRef input="Operate"> }
```

### Resolution strategy

The function uses a **UUID-first** approach:

1. **UUID path (fast, exact)** - reads the companion UUID attribute (e.g. `inputUuid`, `lnodeUuid`, `functionUuid`) and finds the target by exact UUID match. Handles all disambiguation cases including multiple SourceRefs with the same `input` but different `pDA`.
2. **Path fallback** - if the UUID attribute is absent or stale (target deleted), falls back to path-based resolution: parses the path value, splits into segments, and finds the target via segment matching + ancestry verification.

| Strategy               | UUID attribute example | Qualifier extraction                                        |
| ---------------------- | ---------------------- | ----------------------------------------------------------- |
| `direct`               | `functionUuid`         | none                                                        |
| `lnode`                | `sourceLNodeUuid`      | DO.DA suffix (e.g. "Pos.stVal")                             |
| `behavior-description` | `inputUuid`            | pathValue for `dataName`, none for `inputName`/`outputName` |
| `ied-address`          | `extCtrlUuid`          | none                                                        |

::: tip
UUID resolution is always preferred. It is O(1) and unambiguous. The path fallback exists for legacy data without UUID attributes.
:::

---

## findRefsPointingTo

Finds all REF records that reference a target element by UUID, optionally resolving each to a container ancestor.

```ts
reference.query.findRefsPointingTo(
  query: Scl.Query,
  params: {
    target: Scl.Ref<Scl.ElementsOf>
    containerTagName?: Scl.ElementsOf
  },
): Promise<ResolvedReference[]>
```

```ts
type ResolvedReference = {
	ref: Scl.TrackedRecord<Scl.ElementsOf> // the REF record itself
	container: Scl.TrackedRecord<Scl.ElementsOf> | undefined // nearest ancestor of containerTagName
}
```

```ts
// Find all FunctionCatRefs pointing to a Function
const refs = await reference.query.findRefsPointingTo(query, {
	target: { tagName: 'Function', id: 'func-1' },
	containerTagName: 'FunctionCategory',
})
// -> [{ ref: <FunctionCatRef>, container: <FunctionCategory "MMS CLIENTS"> }, ...]

// Find all refs pointing to a target (without container filtering)
const refs = await reference.query.findRefsPointingTo(query, {
	target: { tagName: 'AllocationRole', id: 'ar-1' },
})
// -> [{ ref: <AllocationRoleRef>, container: undefined }, ...]
```

The function:

1. Reads the target's `uuid` attribute
2. Uses `UUID_REFERENCE_PAIRS` to find which REF elements can point to that tag name
3. Queries the DB for REF records whose uuid attribute matches
4. Optionally resolves each REF to its nearest ancestor of `containerTagName`

::: info UUID discovery is path-independent
Discovery keys on the target's **uuid**, regardless of whether the ref's textual path is resolvable. So a ref whose path can't be rebuilt into a stable name (e.g. `VariableApplyTo`, whose `element` may be an XPath — `resolution: 'unsupported'`) is still found by its uuid. This is what lets the lifecycle verbs discover the cross-cutting [satellites](./update#satellites) that apply to an element.

A `Variable` may apply to **any** SCL element (90-30 §12.3.3), so `VariableApplyTo`'s target set in `UUID_REFERENCE_PAIRS` is the full element set — `findRefsPointingTo` finds a `Variable` pointing at any target tag, not a hand-picked subset.
:::

### Type-id targets

`findRefsPointingTo` also resolves **DataTypeTemplates type references**, which are addressed by `id` (not `uuid`). When `target.tagName` is `LNodeType`, `DOType`, `DAType` or `EnumType`, it consults `TYPE_ID_REFERENCE_PAIRS` instead and returns the `lnType` / `type` referrers (`LN`, `LN0`, `LNode`, `DO`, `SDO`, `DA`, `BDA`) pointing at that type id.

```ts
// Find every instance/child referencing an LNodeType by id
const refs = await reference.query.findRefsPointingTo(query, {
	target: { tagName: 'LNodeType', id: 'CSWI_Type' },
})
// -> [{ ref: <LNode lnType="CSWI_Type"> }, { ref: <LN lnType="CSWI_Type"> }, ...]
```

---

## getProvenance

Returns every source-file reference (`SclFileReference`) in the document, each resolved to the element that carries it. A source-file reference records which template file (and version) an element was instantiated from, or which files the document was created from — the cross-file counterpart of the in-document references above.

```ts
const entries = await reference.query.getProvenance(query)
// -> [{ fileType: 'FSD', fileUuid: 'fsd-uuid', version: '2', revision: '1',
//      anchor: { kind: 'function', ref: { tagName: 'Function', id: 'func-1' } } }, ...]
```

Each entry exposes `fileType`, `fileUuid`, `fileName`, `version`, `revision`, and the `anchor` (its `kind` plus the `ref` of the carrying element).

| Anchor kind   | Carried by                                        | Meaning                              |
| ------------- | ------------------------------------------------- | ------------------------------------ |
| `function`    | `FunctionSclRef` under `Function` / `SubFunction` | function instantiated from an FSD    |
| `application` | `ApplicationSclRef` under `Application`           | application instantiated from an ASD |
| `ied`         | `IEDSourceFiles` under `IED`                      | IED imported from an ICD / IID       |
| `document`    | `SourceFiles` under `Header`                      | files used to create this document   |

The anchor is the nearest ancestor of the reference whose tag matches one of these kinds, so it is robust to intermediate `Private` wrappers.

---

## Transaction methods

Access via `tx.reference` inside a `doc.transaction()` callback.

### `applyTypeIdRemap`

Mechanically rewrites the type-id reference attributes (`lnType` / `type`) of the given records according to an `idRemap` (`old type id → new type id`). The registry of which attribute each tag carries comes from `TYPE_ID_REFERENCE_PAIRS`, so no SCL structure is hardcoded.

```ts
tx.reference.applyTypeIdRemap(params: {
  records: Scl.Ref<Scl.ElementsOf>[]
  idRemap: Map<string, string>
}): Promise<void>
```

This is the repointing step used by [`dataModel.importTypes`](./data-model#importtypes) after a fork (R3): once a type is cloned under a new id, the referrers that should follow the fork are remapped. It is reusable by any caller that has computed an `idRemap` — e.g. the merging editor when redirecting in-scope referrers onto a forked type.

```ts
await doc.transaction(async (tx) => {
	await tx.reference.applyTypeIdRemap({
		records: inScopeReferrerRefs,
		idRemap: new Map([['CSWI_Type', 'CSWI_Type_a1b2c3d4']]),
	})
})
```

---

## Resolution strategies

All reference pairs are defined in `UUID_REFERENCE_PAIRS`. Each pair maps a REF element + path attribute to one or more target element types and a resolution strategy.

### `direct` -- 19 pairs

Path attribute value is an exact match against the target's computed path.

```xml
<FunctionRef function="TEMPLATE/V1/Protection" functionUuid="abc-123"/>
<!--          ^path attribute                   ^uuid attribute (resolved) -->
```

### `lnode` -- 7 pairs

Path to an LNode, optionally followed by `.DO[.SDO...][.DA[.BDA...]]` qualifiers.

```xml
<SourceRef source="TEMPLATE/V1/B1/PXCBR1.Pos.stVal" sourceLNodeUuid="def-456"/>
<!--                                    ^qualifier    ^uuid attribute -->
```

The qualifier chain can be arbitrarily deep (e.g. `MMXU1.PhV.phsA.cVal.mag.f` -- 5 levels).

### `ied-address` -- 2 pairs

Reference to `ExtRef`/`ExtCtrl` inside the IED section via `intAddr`. Supports full path and IED-relative fallback.

### `behavior-description` -- 4 pairs

References to `BehaviorDescription` elements by name. Only the target's name segment is used as the path value.

### `unsupported`

Path format requires context not available during streaming. These pairs are recognized but not resolvable at runtime.

---

## Automatic coherence (record hooks)

Reference coherence is an invariant that `@dialecte/scl` maintains for you: the record-lifecycle hooks (`afterCreated`, `afterUpdated`, `beforeDelete`) keep a reference's derived attributes in agreement with its stable identity as a side effect of every mutation. You set the stable half; dialecte derives the rest.

| On mutation of…                                             | dialecte keeps in agreement                    | Rule                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| any reference                                               | path attribute ↔ companion uuid                | path rebuilt from the target on create, on target rename, and cleaned up on delete                                                                                                                                                                                                                                                                            |
| `DOS`/`SDS`/`DAS`                                           | `mappedDoName` / `mappedDaName`                | the implementing short name, present only when it differs from the specified `name`; a `DAS` under an unmapped parent DO carries `DO.DA`                                                                                                                                                                                                                      |
| `SourceRef` / `ControlRef` / `ProcessEcho` / `LNodeDataRef` | path qualifier ↔ companion `*DoName`/`*DaName` | editing a companion DO/DA name rebuilds the path qualifier                                                                                                                                                                                                                                                                                                    |
| `LNode`                                                     | identity ↔ `lnUuid`                            | setting `lnUuid` stamps `iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst` from the target `LN`; clearing it restores the specification identity from `LNodeSpecNaming` (`lnType` stays the specification type). `templateUuid` is left untouched — it records the template the `LNode` was instantiated from, owned by the instantiate lifecycle, not by binding |

Because these run as hooks, a tool never has to compute the derived half — setting the uuid, the companion names or `lnUuid` is enough, and the matching path, short name or identity is filled in the same transaction.

::: info Idempotent
Each rule is a no-op when the record is already coherent, so re-applying the same intent (e.g. writing both halves at once) produces the same document.
:::

---

## Exported constants

The `reference` module re-exports its internal lookup tables and types for advanced use cases (custom hooks, validation, tooling).

```ts
import {
	RESOLUTION_TYPE,
	UUID_REFERENCE_PAIRS,
	RESOLUTION_TARGET_REFS,
	RESOLVABLE_RESOLUTIONS,
	PAIRS_BY_REF,
	ALL_REF_UUID_ATTRIBUTES,
	KEEP_ON_ORPHAN_REFS,
	REF_CONTAINERS,
	PATH_EXTRACTION_CONFIG,
	PATH_CONTRIBUTING_ATTRIBUTES,
} from '@dialecte/scl/v2019C1'
```

| Constant                       | Description                                                                |
| ------------------------------ | -------------------------------------------------------------------------- |
| `RESOLUTION_TYPE`              | Enum-like object of strategy keys (`direct`, `lnode`, etc.)                |
| `UUID_REFERENCE_PAIRS`         | All REF element + path attribute -> target + strategy pairs                |
| `RESOLUTION_TARGET_REFS`       | Derived: target tag names that can be referenced                           |
| `RESOLVABLE_RESOLUTIONS`       | Derived: pairs whose strategy is not `unsupported`                         |
| `PAIRS_BY_REF`                 | Derived: pairs grouped by REF element tag name                             |
| `ALL_REF_UUID_ATTRIBUTES`      | Derived: all uuid attribute names across pairs                             |
| `KEEP_ON_ORPHAN_REFS`          | Rules for which attributes to preserve when a REF becomes orphaned         |
| `REF_CONTAINERS`               | Tag names considered REF containers (for `findRefsPointingTo`)             |
| `PATH_EXTRACTION_CONFIG`       | Per-element strategy for building path segments (`name`, `lnClass`, etc.)  |
| `PATH_CONTRIBUTING_ATTRIBUTES` | Attribute names that affect path segments (derived from extraction config) |

---

## Typical workflows

### Reparenting: update all REFs pointing to a moved element

```ts
import { reference } from '@dialecte/scl/v2019C1'

await doc.transaction(async (tx) => {
	// Move Function to new Bay
	await tx.moveElement(functionRef, newBayRef)

	// Find all REF records pointing to this Function
	const refs = await reference.query.findRefsPointingTo(tx, { target: functionRef })

	// Rebuild each REF's path attribute to reflect the new location
	for (const { ref } of refs) {
		const newPath = await reference.query.buildReferencePath(tx, {
			reference: ref,
			target: functionRef,
		})
		if (newPath) {
			const pathAttr = ref.attributes.find((attribute) => attribute.name === 'function')?.name
			if (pathAttr) await tx.update(ref, { name: pathAttr, value: newPath })
		}
	}
})
```

### Extraction: collect all FunctionCategory IDs referencing a Function tree

```ts
import { reference } from '@dialecte/scl/v2019C1'

const refs = await reference.query.findRefsPointingTo(sourceQuery, {
	target: functionRef,
	containerTagName: 'FunctionCategory',
})

const categoryIds = new Set<string>()
for (const { container } of refs) {
	if (container) categoryIds.add(container.id)
}
```

### Resolving a SourceRef to its LNode target + DO/DA qualifier

```ts
const result = await reference.query.resolveReferencePath(query, sourceRefRecord, 'source')
if (result) {
	console.log(result.record.tagName) // "LNode"
	console.log(result.qualifier) // "Pos.stVal"
}
```
