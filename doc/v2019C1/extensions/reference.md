---
description: Reference extension for @dialecte/scl v2019C1 -- path building, resolution, and reverse-lookup for SCL reference elements.
---

# Reference

The `reference` module provides functions for working with SCL reference paths: query functions across **building** paths (write side), **resolving** them (read side) and one **reverse-lookup**, plus **transaction** helpers for remapping DataTypeTemplates type-id references (`applyTypeIdRemap`) and cloned uuid references (`applyUuidRemap`).

```ts
import { reference } from '@dialecte/scl/v2019C1'
```

## Overview

```
buildElementPath     <->  resolveElementPath    (element <-> canonical path string)
buildReferencePath   <->  resolveReferencePath   (REF attr value <-> target record)
                          findRefsPointingTo     (reverse: target -> all REF records)
buildMappedLNodePath <->  resolveMappedLNode     (mapped LNode <-> implementing LN)
                          resolveMappedData      (DOS/SDS/DAS -> implementing LN + data path)
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
| `resolveMappedData`    | read      | `DOS`/`SDS`/`DAS` ref                | `MappedData` (`LN` ref + data path + origin)             | finding the data that implements a specified data object      |
| `getPathSegment`       | write     | a record (+ context)                 | `PathSegment` (segment + separator) or `null`            | the segment of one element, without a query                   |

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

| Element    | Segment format                      | Example                   |
| ---------- | ----------------------------------- | ------------------------- |
| LN/LN0     | `prefix` + `lnClass` + `inst`       | `PXCBR1`, `LLN0`          |
| LNode      | its specified naming, see below     | `XCBR1`                   |
| LDevice    | `inst` attribute                    | `LD0`                     |
| SourceRef  | named among its siblings, see below | `Trip`, `Trip(1).general` |
| ControlRef | named among its siblings, see below | `TripCmd`, `TripCmd(2)`   |
| ExtRef     | `intAddr` attribute                 | `TrCmd.stVal`             |

**LNode names**: an `LNode` is named by the naming it was specified with, so binding it to an IED does not change the paths through it.

- While no IED is assigned to it (`iedName` unset or `None`), its own `prefix` + `lnClass` + `lnInst`, which are its specified naming; an edit of them is written to its `LNodeSpecNaming` too.
- Once one is, binding writes the IED's naming on the `LNode` (`Q0XCBR2`): the segment is `sPrefix` + `sLnClass` + `sLnInst` of its `LNodeSpecNaming` (`XCBR1`; the class read from the `LNode` when the naming has none), its own attributes when it has none.
- Editing, adding or removing its `LNodeSpecNaming` rebuilds the paths through it. On import, a path an earlier version wrote with the IED's naming (`S1/F1/Q0XCBR2.Pos`) still resolves and is written again as specified, also next to a uuid; the same holds for a signal name in a former form.

**SourceRef/ControlRef names**: a signal is named among the SourceRefs (ControlRefs) of its LNode.

- While no other SourceRef of the LNode has the same `input`, the name is the plain `input`: no instance, no `pDA`.
- Once one does, the name is `input(inputInst)`, then `.pDA` when `pDA` is set. The instance is written even when it is the schema default `1`.
- ControlRef: `output`, or `output(outputInst)` once another ControlRef has the same `output`.
- Adding, renaming or removing a SourceRef / ControlRef renames the references to the ones that share its name.
- A name is read back by comparing it with the names built for the candidates, never by splitting it: an `input` may itself hold a dot (`PTOC1.Op`).

```ts
// Trip alone                          ->  "Trip"   (also with pDA="general", or inputInst="2")
// Trip pDA="general" + Trip pDA="q"   ->  "Trip(1).general", "Trip(1).q"
// Trip + Trip inputInst="2"           ->  "Trip(1)", "Trip(2)"
```

On import, the names an earlier version wrote (`Trip.general` for the only `Trip`, `Trip(2)` for the only one of instance 2, `Trip` for instance 1 of several) still resolve, and an `InputVar` / `OutputVar` name is written again in the standard form.

---

## getPathSegment

The segment a reference path gives one element, read from the record alone — no query. Cheaper than `buildElementPath` when only that question matters. Exported from `@dialecte/scl/v2019C1` with its result type `PathSegment`.

```ts
import { getPathSegment } from '@dialecte/scl/v2019C1'

getPathSegment(
  record: AnyRawRecord,
  context?: {
    siblings?: readonly AnyRawRecord[] // the children of its parent, itself included — for a signal, named among them
    specNaming?: AnyRawRecord          // its `LNodeSpecNaming` — for an LNode, named by its specified naming
  },
): { segment: string; separator: '/' | '.' } | null
```

`null` when a path cannot address the element: a transparent container (`AccessPoint`, `Server`) or an element without identifiable attributes. Without `siblings` a signal is taken as the only one of its name; without `specNaming` an LNode is named by its own attributes.

```ts
getPathSegment(lnode, { specNaming }) // -> { segment: 'XCBR1', separator: '/' }
getPathSegment(sourceRef, { siblings }) // -> { segment: 'Trip(1).general', separator: '.' }
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
    targetPath?: ElementPath             // the target's path, when already read (several references to one target)
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

- **lnode** refs (`SourceRef`, `ControlRef`, `ProcessEcho`, `LNodeDataRef`): the DO/DA qualifier is taken from the companion `*DoName`/`*DaName` attributes when the stored path already carries one, or when the reference has no path yet; a stored path that stops at the LN level stays companions-only.
- **behavior-description** refs (`InputVar`, `OutputVar`): a local path, from the parent of the `BehaviorDescription` down to the target, that parent left out. `dataName` ends with the companion DO[.DA]: `Pos.stVal` when the target is the `LNode` holding the `BehaviorDescription`, `XCBR1.Pos.stVal` from its `Function`. `inputName` / `outputName`: `Trip` from the `LNode`, `XCBR1.Trip` from its `Function`. `null` when the target is not below that parent.
- **signal role** refs (`LNodeInputRef`, `LNodeOutputRef`, `LNodeDataRef`, `scope: 'function'` in `UUID_REFERENCE_PAIRS`): the path from the target's Function down, that Function left out. Its Function is the nearest `Function` or `EqFunction` above the target, never a `SubFunction`. `sourceRef` / `controlRef` join every level with `/` (`PTRC1/Trip`, `SF1/XCBR1/Oper`); `data` joins the levels down to the `LNode` with `/`, then its DO[.DA] with `.` (`SF1/XCBR1.Pos.stVal`). Renaming the Function leaves them as they are. Read back from the Function the referrer's `FunctionRef` names (or the nearest one above the SubFunction it names); on import an absolute path an earlier version wrote still resolves and is written again in this form.
- **mapped data** (`DOS`/`SDS`/`DAS`): returns `null` — `mappedDoName`/`mappedDaName` is a data path inside the logical node named by `mappedLnUuid`, not a path to the target element. The hooks store it (see [Automatic coherence](#automatic-coherence-record-hooks)); read it with [`resolveMappedData`](#resolvemappeddata).

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

## resolveMappedData

The data that implements a `DOS` / `SDS` / `DAS`: the `LN` (or `LN0`) of an IED and the path to the data inside it.

```ts
reference.query.resolveMappedData(
  query: Scl.Query | Scl.Transaction,
  params: { reference: Scl.Ref<'DOS' | 'SDS' | 'DAS'> },
): Promise<MappedData | undefined>

type MappedData = {
  ln: Scl.Ref<'LN' | 'LN0'>
  dataPath: readonly string[] // one segment per DO / SDO / DA / BDA, an array element as `name(n)`
  origin: 'own' | 'default'
}
```

A record that names nothing follows its **default**: its parent `DOS`/`SDS` extended by its own name, or for a `DOS` the logical node its `LNode` is mapped to (`lnUuid`, else the identity it names) and its own name. Only a record that is implemented elsewhere carries `mappedDoName`/`mappedDaName` and `mappedLnUuid`; the name is the path from that logical node, always starting at the data object (`Health`, `PhV.phsB`, `Ind2.stVal`).

```xml
<LNode iedName="VENDOR" ldInst="LD0" lnClass="PTOC" lnInst="1" lnUuid="ptoc1-uuid">
  <Private type="eIEC61850-6-100">
    <eIEC61850-6-100:DOS name="Op"/>                                                   <!-- PTOC1, Op            (default) -->
    <eIEC61850-6-100:DOS name="Mod" mappedDoName="Health" mappedLnUuid="ptoc1-uuid">  <!-- PTOC1, Health        (own)     -->
      <eIEC61850-6-100:DAS name="ctlModel"/>                                           <!-- PTOC1, Health.ctlModel (default) -->
    </eIEC61850-6-100:DOS>
    <eIEC61850-6-100:DOS name="Str">
      <eIEC61850-6-100:DAS name="general" mappedDaName="Ind1.stVal" mappedLnUuid="ggio1-uuid"/> <!-- GGIO1, Ind1.stVal (own) -->
    </eIEC61850-6-100:DOS>
  </Private>
</LNode>
```

Other stored forms are read as well; the import and the hooks store them in canonical form:

| Stored                                                                 | Read as                                                                                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `mappedLnUuid` + path                                                  | that logical node, that path                                                                                                             |
| `mappedLnUuid` + absolute reference                                    | that logical node, the data part of the reference; the import warns `incoherent-reference` when the reference names another logical node |
| `mappedLnUuid` only                                                    | that logical node, the default data path                                                                                                 |
| path only                                                              | the logical node the `LNode` is mapped to, that path                                                                                     |
| absolute reference only                                                | the logical node found by path, the data part                                                                                            |
| a logical node absent from the file, or no `LNode` mapping and no name | `undefined`                                                                                                                              |

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

For a `DOS`/`SDS`/`DAS` it answers with [`resolveMappedData`](#resolvemappeddata): `record` is the implementing `LN`/`LN0` and `qualifier` the data path, also when the record names nothing and follows its default.

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

A `Variable` may apply to **any** SCL element, so `VariableApplyTo`'s target set in `UUID_REFERENCE_PAIRS` is the full element set — `findRefsPointingTo` finds a `Variable` pointing at any target tag, not a hand-picked subset.
:::

### Logical node targets

For an `LN` / `LN0` target the result also lists the `DOS` / `SDS` / `DAS` it implements by default: they carry no `mappedLnUuid`, but follow it through the `LNode` mapped to it (by `lnUuid` or by identity) or through a parent `DOS` / `SDS` whose own pair names it. Records with their own pair are found by their uuid as any reference. See [`resolveMappedData`](#resolvemappeddata).

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

### `setMappedData`

States which data implements a `DOS` / `SDS` / `DAS` and returns what was stored. The writer gives the intent; scl decides the attributes.

```ts
tx.reference.setMappedData(params: {
  reference: Scl.Ref<'DOS' | 'SDS' | 'DAS'>
  implementation?: { ln: Scl.Ref<'LN' | 'LN0'>; dataPath: readonly string[] } // omit: follow the default
}): Promise<{ kind: 'stored' | 'default' | 'inexpressible' }>
```

```ts
await tx.reference.setMappedData({
	reference: { tagName: 'DOS', id: 'dos-mod' },
	implementation: { ln: { tagName: 'LN', id: 'ptoc1' }, dataPath: ['Health'] },
})
// -> { kind: 'stored' }: <DOS name="Mod" mappedDoName="Health" mappedLnUuid="ptoc1-uuid"/>
```

- `default`: the implementation is the record's default (or none was given); the record carries neither attribute.
- `inexpressible`: the schema has no value for that path on this record (an `SDS` standing for an attribute structure, a second sub data object level); nothing is written. Document the deviation on the `DAS` below, whose path can go down to any attribute.

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

### `applyUuidRemap`

Repoints the **uuid** reference attributes of freshly cloned elements onto their clones and recomputes the reference paths, in one pass. Takes the source→target `cloneMappings` a clone produced (`CloneMapping[]`); for each cloned element it rewrites every uuid-ref attribute (from `UUID_REFERENCE_PAIRS`) whose value matches a cloned source uuid to the target's uuid, then rebuilds the companion path. Optional `redirectMappings` name source elements that were not cloned because they map onto an element the target already holds: references to them are repointed to that element the same way. A cloned reference named by a tuple of attributes ([`TUPLE_REFERENCE_PAIRS`](#references-of-the-ied-section-named-by-their-attributes)) gets the uuid of the clone of what it names, or of the element a redirect maps it onto, and writes that element's names where they differ, `iedName="@"` included when that element is in another IED (a clone renamed afterwards is followed by its references, see below).

```ts
tx.reference.applyUuidRemap(params: {
  cloneMappings: CloneMapping<Config>[]
  redirectMappings?: { sourceUuid: string; target: Ref }[]
}): Promise<void>
```

Deep clone ([`transplant.deep`](./transplant)) is a **purely structural** copy — it does not rewire references; the caller owns rewiring. The lifecycle recipes ([`instantiate`](./instantiate) / [`extract`](./extract), FSD + ASD) call `applyUuidRemap` **once** over their accumulated clone mappings (function + categories + satellites), so a reference that crosses sub-clones — e.g. a `FunctionCatRef` on a cloned category pointing at the cloned function — resolves to its target. Run it after every clone is staged and before lineage stamping / provenance, which read the repointed refs.

This replaces the former `afterDeepClone` core hook (removed): that hook's per-element scan accumulated across the whole transaction and grew with clone size.

---

## Resolution strategies

All reference pairs are defined in `UUID_REFERENCE_PAIRS`. Each pair maps a REF element + path attribute to one or more target element types and a resolution strategy.

### `direct` -- 17 pairs

Path attribute value is an exact match against the target's computed path.

```xml
<FunctionRef function="TEMPLATE/V1/Protection" functionUuid="abc-123"/>
<!--          ^path attribute                   ^uuid attribute (resolved) -->
```

A `Terminal` (and a `NeutralPoint`) names its `ConnectivityNode` this way: `connectivityNode` is the node's full path, `cNodeUuid` its uuid. See [Attributes written from a path](#attributes-written-from-a-path) for the level names written next to it.

### `lnode` -- 7 pairs

Path to an LNode, optionally followed by `.DO[.SDO...][.DA[.BDA...]]` qualifiers.

```xml
<SourceRef source="TEMPLATE/V1/B1/PXCBR1.Pos.stVal" sourceLNodeUuid="def-456"/>
<!--                                    ^qualifier    ^uuid attribute -->
```

The qualifier chain can be arbitrarily deep (e.g. `MMXU1.PhV.phsA.cVal.mag.f` -- 5 levels).

### `ied-address` -- 2 pairs

Reference to the `ExtRef`/`ExtCtrl` implementing a `SourceRef`/`ControlRef` (`extRefAddr`, `extCtrlAddr`), read and written in three forms:

- the full path, `IED/LDevice/LN.intAddr` (`PIU/CB_Function/LCBO1.TrCmd.stVal`): written when the signal's `LNode` is mapped to no IED or to another one, or when the `ExtRef`'s logical node is held directly by an access point;
- the path inside the IED of the `LNode`, `LDevice/LN.intAddr` (`CB_Function/LCBO1.TrCmd.stVal`): written when the `ExtRef` sits in another logical node of that IED;
- the `intAddr` alone, or marked `@intAddr` when read, when the `ExtRef` sits in the LN implementing the `LNode` (`TrCmd.stVal`), read in the LN its `iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst` name: the engine writes it unmarked.

An `ExtRef`/`ExtCtrl` without an `intAddr` has no address: none is written. The logical node the `LNode` is mapped to is read from its naming attributes (`iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst`), which setting its `lnUuid` writes. The address follows the renames of the `ExtRef`'s own logical device and IED and the mapping changes of the signal's `LNode` (mapping, remapping or unmapping it rewrites the addresses of its signals, and removes one that can no longer be written); an `LNode` bound by `lnUuid` does not yet have them follow a rename of the logical device or IED of its logical node, so after such a rename the address is written in the `LD/LN.intAddr` or the full form.

[`tx.dataflow.link`](./dataflow#link) writes the address from the element it links to, in the form its place gives.

A value is kept in the form it is written in.

### `ancestor-name` -- 4 pairs

`resourceName` on `SourceRef`, `ControlRef`, `SubscriberLNode`, `ControllingLNode`: the bare name of a `ProcessResource`, looked up in the referrer's ancestors, nearest first. A homonym higher up is not reached while a nearer one exists; renaming an ancestor leaves the name untouched.

```xml
<Function name="F1">
	<ProcessResources><ProcessResource name="PR1" uuid="pr-1"/></ProcessResources>
	<LNode lnClass="PTRC" lnInst="1">
		<LNodeInputs><SourceRef input="Trip" resourceName="PR1" resourceUuid="pr-1"/></LNodeInputs>
	</LNode>
</Function>
```

On import, the full path an earlier version wrote (`S1/F1/PR1`) still resolves and is written again as the name.

### `behavior-description` -- 4 pairs

`InputVar` / `OutputVar` references, local to the parent of their `BehaviorDescription` (see [buildReferencePath](#buildreferencepath)).

### `unsupported`

Path format requires context not available during streaming. These pairs are recognized but not resolvable at runtime.

### References of the IED section named by their attributes

Some references of the IED section name their target by several attributes (a tuple) beside one uuid attribute, instead of one path. They are listed in `TUPLE_REFERENCE_PAIRS`:

| Referrer                             | uuid                           | Target                                                 | Named by                                                                                                                |
| ------------------------------------ | ------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `ConnectedAP`, `KDC`                 | `apUuid`                       | `AccessPoint`                                          | `iedName`, `apName`                                                                                                     |
| `ServerAt`                           | `apUuid`                       | `AccessPoint`                                          | the IED it sits in, `apName`                                                                                            |
| `ClientLN`, `Association`, `ExtCtrl` | `lnUuid`                       | `LN` / `LN0`                                           | `iedName`, `ldInst`, `prefix`, `lnClass`, `lnInst`                                                                      |
| `ExtRef`                             | `lnUuid`                       | `LN` / `LN0`                                           | `iedName`, `ldInst`, `prefix`, `lnClass`, `lnInst`                                                                      |
| `ExtRef`                             | `srcCBUuid`                    | `GSEControl` / `SampledValueControl` / `ReportControl` | `iedName`, `srcLDInst`, `srcPrefix`, `srcLNClass`, `srcLNInst`, `srcCBName`                                             |
| `FCDA`                               | `lnUuid`                       | `LN` / `LN0`                                           | the IED it sits in, `ldInst`, `prefix`, `lnClass`, `lnInst`                                                             |
| `GSE`, `SMV`                         | `cbUuid`                       | `GSEControl` / `SampledValueControl`                   | the `iedName` of its `ConnectedAP`, `ldInst`, `cbName`                                                                  |
| `IEDName`                            | `apUuid` / `ldUuid` / `lnUuid` | `AccessPoint` / `LDevice` / `LN` / `LN0`               | its text (the IED), `apRef` / `ldInst` / `ldInst`, `prefix`, `lnClass`, `lnInst` — the most precise one that is written |

A name the referrer leaves out takes its schema value. An `ExtRef` / `ExtCtrl` writing `iedName="@"` names the IED it sits in. An `ExtRef` naming a control block without its logical device names the one of the data it subscribes to (`ldInst`); without its logical node, `LN0`, the only element holding GOOSE and sampled value control blocks. Control blocks of different kinds may share a name: an `ExtRef`'s `serviceType` (`GOOSE`, `SMV`, `Report`) says which one it names. An access point is not part of a data path: it is named apart (IED and access point name), and the paths of logical nodes do not change.

A reference created with its uuid and without the names of its target gets them in the same transaction (an `ExtRef` created with `srcCBUuid` only gets `iedName`, `srcLDInst`, `srcCBName`, and `srcPrefix` / `srcLNClass` / `srcLNInst` when the control block is in a logical node other than the LN0; an `IEDName` created with `apUuid` only gets its text and `apRef`); a target created with a uuid (an access point, a logical device, a logical node, a control block) gives its names to the references already naming it by that uuid. Only a name that differs is written.

On import, such a reference written without its uuid gets the uuid of the element its names name in the file. A name naming nothing in the file (another device, in a file of one device), or naming several elements the reference cannot tell apart, is left as written, without a warning. A logical node held directly by an access point (a client logical node) is not named this way yet: a `ClientLN` naming one is left as written.

---

## Automatic coherence (record hooks)

Reference coherence is an invariant that `@dialecte/scl` maintains for you: the record-lifecycle hooks (`afterCreated`, `afterUpdated`, `beforeDelete`, `afterDelete`, `beforeCommit`) keep a reference's derived attributes in agreement with its stable identity as a side effect of every mutation. You set the stable half; dialecte derives the rest.

| On mutation of…                                                                                              | dialecte keeps in agreement                      | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| any reference                                                                                                | path attribute ↔ companion uuid                  | path written from the target on create (a reference created with its uuid only gets its path), rebuilt on target rename (written when it was missing), cleaned up on delete. A reference carrying several uuids (a `SourceRef` with its source LNode and its process resource) gets every path, on create and on update                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `DOS`/`SDS`/`DAS`                                                                                            | `mappedDoName` / `mappedDaName` ↔ `mappedLnUuid` | stored together or not at all: nothing when the record is implemented by its default, otherwise the path from the implementing logical node with that node's uuid (an absolute reference or a uuid alone is completed). A change to an `LNode` mapping or to a parent's mapping re-stores the records below it; one whose implementation became the default loses both attributes. A path the schema cannot hold is left as written                                                                                                                                                                                                                                                                                                                                              |
| `SourceRef` / `ControlRef` / `ProcessEcho` / `LNodeDataRef`                                                  | path qualifier ↔ companion `*DoName`/`*DaName`   | editing a companion DO/DA name rebuilds the path qualifier (the companions are the data: the uuid wins, a path edited while its uuid names a target is written again from the companions)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `LNode`                                                                                                      | identity ↔ `lnUuid`                              | setting `lnUuid` stamps `iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst` from the target `LN`; clearing it restores the specification identity from `LNodeSpecNaming`, its logical device included (`lnType` stays the specification type). `templateUuid` is left untouched — it records the template the `LNode` was instantiated from, owned by the instantiate lifecycle, not by binding                                                                                                                                                                                                                                                                                                                                                                                       |
| a target of an IED reference named by a tuple (`IED`, `AccessPoint`, `LDevice`, `LN` / `LN0`, control block) | the names its references wrote for it            | creating an `AccessPoint`, `LDevice`, `LN` / `LN0` or control block with a uuid writes its names on the references naming that uuid (creating an `IED` writes nothing), and a reference created with a uuid takes the names of its target. Renaming it, or an element above it, rewrites the names of the references pointing at it (or below it) by uuid: `ConnectedAP` `iedName` / `apName`, `ExtRef` `iedName` / `ldInst` / `lnInst` / `srcCBName`..., `FCDA`, `GSE` / `SMV`, an `IEDName`'s text. Only a name that differs is written: a name the target leaves out (no prefix) is removed, a part left to its schema value or to another of its attributes (`srcLDInst` left to `ldInst`) stays left out, `iedName="@"` stays. A reference without its uuid is not followed |
| `DataSet`                                                                                                    | the `datSet` of its control blocks               | renaming it rewrites the `datSet` of the control blocks of its logical node that publish it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### Attributes written from a path

Some attributes are written from a path every time that path is, and never given by a caller (`DERIVED_REFERENCE_ATTRIBUTES`):

- a `Terminal` or a `NeutralPoint` lists, next to `connectivityNode`, the names of the levels holding its node: `processName` (nested processes joined with `/`), `lineName`, or `substationName`, `voltageLevelName` and `bayName`, then `cNodeName`. A level the node is not in is left out (a node in a `Line` gets `lineName`, never `bayName`);
- a `ConnectivityNode` holds its own path in `pathName`.

```xml
<Bay name="B1">
	<ConductingEquipment name="QA1" type="CBR">
		<Terminal connectivityNode="S1/VL1/B1/L1" substationName="S1" voltageLevelName="VL1" bayName="B1" cNodeName="L1" cNodeUuid="9839…"/>
	</ConductingEquipment>
	<ConnectivityNode name="L1" pathName="S1/VL1/B1/L1" uuid="9839…"/>
</Bay>
```

| On…                                                      | the terminals and the node                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| a terminal created with its `cNodeUuid`                  | get `connectivityNode` and the level names of that node; names given for another node are replaced or removed |
| a node created                                           | gets its `pathName`; the terminals already carrying its uuid get their path and names                         |
| a rename of the node or of a level above it              | the node's `pathName` and the path and names of its terminals follow                                          |
| a terminal pointed at another node (`cNodeUuid` changed) | its path and names follow that node; a level name edited by hand is written again from the node               |
| a node deleted (or a level holding it)                   | the terminals connected to it are deleted, the equipment stays: an equipment that is not connected has none   |

The lifecycle verbs follow from it: an extracted bay-typical names its nodes under the `TEMPLATE` scaffolding, and a terminal on a node outside the extracted scope is removed; an instantiated or updated one names the nodes placed with it, under the project's levels. A template's paths and level names are never copied onto an instance.

**Every `LNode` carries its `LNodeSpecNaming`** (in its `eIEC61850-6-100` `Private`), the naming it was specified with, kept while an IED identity is stamped on the `LNode`:

- an `LNode` a transaction creates keeps the one it was given, by a copy or by the caller; otherwise, when the transaction's work is done (`beforeCommit`), it gets one from its own naming: `sLdInst`, `sPrefix`, `sLnClass`, `sLnInst` while no IED is assigned; once one is (`iedName` set and not `None`), only `sPrefix`, `sLnClass`, `sLnInst`, the IED and LD names being the implementation's;
- setting `lnUuid` on an `LNode` that has none gives it one from the naming it has before the identity is stamped;
- on import, an `LNode` without one gets one by the same rule; when it is bound to an IED the import reports a `derived-specification-naming` warning ([errors](../api/errors#import-warnings)).

On import, a reference naming an LNode's data by path (a `SourceRef`, `ControlRef`, `ProcessEcho`, `LNodeDataRef`, an `InputVar` / `OutputVar` `dataName`) gets its data names written beside the uuid: the data path (`S1/F1/PTRC1.PhV.phsA.cVal.mag.f`) is split between the data object (`PhV.phsA`) and the data attribute (`cVal.mag.f`) against the data model of the logical node type the LNode names (`lnType`), and written as `sourceDoName` / `sourceDaName` (`controlledDoName`, `doName` / `daName`). A companion already there (an empty one counts as absent) is kept; a data attribute name there without the data object gets the data object when the split agrees with it. A reference whose data object cannot be written (the LNode names no type, the file lacks the type or a name below it, the path stops on the logical node or reaches a data attribute where only a data object is held) is left as read, without the uuid, and the import reports a `data-path-not-split` warning.

On import, a reference that carries its uuid and no path (a file written by a tool that sets the uuid only) gets its path once the whole file is stored, built like on create; a uuid that names no element of the file leaves the reference without a path. A reference whose path names another element than its uuid (or none) is written again from the element the uuid names, with an `incoherent-reference` warning. The attributes written from a path are completed the same way; a value the file gave that disagrees with the path is rewritten, with an `incoherent-path-names` warning. A terminal naming the predefined `grounded` node, which a file need not declare, is kept without a uuid and without a warning ([errors](../api/errors#import-warnings)).

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
	TUPLE_REFERENCE_PAIRS,
	RESOLUTION_TARGET_REFS,
	RESOLVABLE_RESOLUTIONS,
	PAIRS_BY_REF,
	ALL_REF_UUID_ATTRIBUTES,
	REF_ENTRIES_BY_TARGET,
	DERIVED_REFERENCE_ATTRIBUTES,
	DERIVED_ATTRIBUTES_BY_TAG,
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
| `TUPLE_REFERENCE_PAIRS`        | IED-section references named by several attributes beside one uuid         |
| `RESOLUTION_TARGET_REFS`       | Derived: target tag names that can be referenced                           |
| `RESOLVABLE_RESOLUTIONS`       | Derived: pairs whose strategy is not `unsupported`                         |
| `PAIRS_BY_REF`                 | Derived: pairs grouped by REF element tag name                             |
| `ALL_REF_UUID_ATTRIBUTES`      | Derived: all uuid attribute names across pairs                             |
| `REF_ENTRIES_BY_TARGET`        | Derived: per target tag, the references that can name it by uuid           |
| `DERIVED_REFERENCE_ATTRIBUTES` | Attributes written from a path, per element tag (terminal level names, …)  |
| `DERIVED_ATTRIBUTES_BY_TAG`    | Derived: `DERIVED_REFERENCE_ATTRIBUTES` as a map by tag name               |
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
