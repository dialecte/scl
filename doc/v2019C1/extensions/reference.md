---
description: Reference extension for @dialecte/scl v2019C1 -- path building, resolution, and reverse-lookup for SCL reference elements.
---

# Reference

The `reference` module provides query functions for working with SCL reference paths. Five functions, two concerns: **building** paths (write side) and **resolving** them (read side), plus one **reverse-lookup**.

```ts
import { reference } from '@dialecte/scl/v2019C1'
```

## Overview

```
buildElementPath    <->  resolveElementPath    (element <-> canonical path string)
buildReferencePath  <->  resolveReferencePath   (REF attr value <-> target record)
                         findRefsPointingTo     (reverse: target -> all REF records)
```

| Function               | Direction | Input                                | Output                                   | Use when                                                      |
| ---------------------- | --------- | ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------- |
| `buildElementPath`     | write     | `ref`                                | canonical path string (`"S1/V1/B1/CE1"`) | computing the path _to_ an element from its ancestry          |
| `buildReferencePath`   | write     | `reference` (REF element) + `target` | path value to store on the REF attribute | updating a REF element to point at a new target               |
| `resolveElementPath`   | read      | raw path string                      | `TrackedRecord`                          | inverse of `buildElementPath` -- walk tree by path string     |
| `resolveReferencePath` | read      | REF record + path attribute name     | `{ record, qualifier }`                  | inverse of `buildReferencePath` -- follow a REF to its target |
| `findRefsPointingTo`   | reverse   | target ref + optional container      | `ResolvedReference[]`                    | find all REF records pointing to a given element              |

### Name distinctions

- **`buildElementPath`** vs **`buildReferencePath`** -- element path is the canonical address of an element; reference path is the value stored on a REF attribute (which may include a qualifier, e.g. `.Pos.stVal`).
- **`resolveReferencePath`** vs **`resolveElementPath`** -- `resolveReferencePath` follows a REF record's stored attribute; `resolveElementPath` walks the tree directly from a raw string.
- **`findRefsPointingTo`** vs **`resolveReferencePath`** -- `resolveReferencePath(ref)` gives you the target _of_ one ref; `findRefsPointingTo(target)` gives you all refs _pointing at_ a target. Opposite direction.

---

## buildElementPath

Computes the canonical path string for any element from its ancestry chain.

```ts
reference.query.buildElementPath(
  query: Scl.Query,
  ref: Scl.Ref<Scl.ElementsOf>,
): Promise<string | null>
```

```ts
const path = await reference.query.buildElementPath(query, { tagName: 'Function', id: 'func-1' })
// -> "TEMPLATE/V1/B1/Protection"
```

Returns `null` if the record is not found. The path is built by concatenating each ancestor's path segment (typically the `name` attribute) with `/`.

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

// For lnode resolution, preserves the DO/DA qualifier from the current value
const path = await reference.query.buildReferencePath(query, {
	reference: { tagName: 'SourceRef', id: 'sref-1' },
	target: { tagName: 'LNode', id: 'lnode-1' },
})
// -> "TEMPLATE/V1/B1/PXCBR1.Pos.stVal"  (qualifier preserved from current sourceRef value)
```

Derives the resolution strategy from `UUID_REFERENCE_PAIRS` using the reference and target tag names. Returns `null` if no pair matches or the path is unresolvable.

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
```

The function reads the path value from the record's attributes, infers the resolution strategy from `UUID_REFERENCE_PAIRS`, parses the path, and finds the target via segment matching + ancestry verification.

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

References to `ExtRef`/`ExtCtrl` inside the IED section via `intAddr`. Supports full path and IED-relative fallback.

### `behavior-description` -- 4 pairs

References to `BehaviorDescription` elements by name. Only the target's name segment is used as the path value.

### `unsupported`

Path format requires context not available during streaming. These pairs are recognized but not resolvable at runtime.

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
