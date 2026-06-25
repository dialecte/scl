---
description: Data Model extension for @dialecte/scl v2019C1 — resolve LNodeType/DOType/DAType/EnumType trees and content-addressed import into a target DataTypeTemplates.
---

# Data Model

The `dataModel` extension resolves the IEC 61850 data model for `LNode` and `LN` records, and imports the required types into a target `DataTypeTemplates` section — content-addressed, so structurally-identical types are deduplicated and divergent ones are forked.

## Types

### `ResolvedDataModel`

Returned by `resolve`. A flat snapshot of all data model types reachable from the input records.

```ts
type ResolvedDataModel = {
	lnodeTypes: Scl.TrackedRecord<'LNodeType'>[]
	doTypes: Scl.TrackedRecord<'DOType'>[]
	daTypes: Scl.TrackedRecord<'DAType'>[]
	enumTypes: Scl.TrackedRecord<'EnumType'>[]
}
```

## Query methods

Access via `doc.query.dataModel`.

### `resolve`

Walks the data model tree starting from a list of `LNode` or `LN` records. For each record it follows `lnType` → `LNodeType` → `DO.type` → `DOType` → `DA.type` → `DAType`/`EnumType`. Deduplicates by `id`.

```ts
resolve(params: {
  records: (Scl.TrackedRecord<'LNode'> | Scl.TrackedRecord<'LN'>)[]
}): Promise<ResolvedDataModel>
```

```ts
const root = await doc.query.getRoot()
const { LNode: lnodes = [] } = await doc.query.findDescendants(root)

const model = await doc.query.dataModel.resolve({ records: lnodes })
console.log(model.lnodeTypes.length) // → number of unique LNodeType records
```

## Transaction methods

Access via `tx.dataModel` inside a `doc.transaction()` callback.

### `importTypes`

Resolves the type closure of the given `LNode`/`LN` records and imports it into the current transaction's `DataTypeTemplates` (created if absent), **content-addressed** (§6.9). For each type, bottom-up:

- **R1 — reuse:** a structurally-identical type already exists in the target → its id is reused (dedup);
- **R2 — preserve:** no structural match and the id is free → clone, keeping the id;
- **R3 — fork:** no match but the id is taken by _different_ content → clone under a new id (`forkId`, default a content hash) and propagate the fork to referrers.

Child type references inside the imported types — and the `lnType`/`type` of the instances passed in `cloneMappings` — are repointed to the reconciled ids in the same transaction. With an empty / non-colliding target and no `cloneMappings`, the result is byte-identical to a plain id-preserving clone.

> Renamed from `extract` in this release. Structural equality is computed by [`signature.elementSignature`](./signature).

```ts
importTypes(params: {
  sourceQuery: Scl.Query
  records: (Scl.TrackedRecord<'LNode'> | Scl.TrackedRecord<'LN'>)[]
  cloneMappings?: Scl.CloneMapping[]   // repoint cloned instances' lnType/type on fork
  forkId?: (ctx: { tagName: string; baseName: string; signature: string }) => string
}): Promise<{
  idRemap: Map<string, string>                              // source type id -> reconciled id
  stats: { reused: number; preserved: number; forked: number }
}>
```

Typical use: when extracting a function to a new `.fsd` file, import the data model types the function depends on (this is what [`extraction.deep`](./extraction#deep) does internally).

```ts
const sourceDoc = project.openDocument(sourceDocumentId)
const targetDoc = project.openDocument(targetDocumentId)

const { LNode: lnodes = [] } = await sourceDoc.query.findDescendants(functionRecord)

await targetDoc.transaction(async (tx) => {
	const { idRemap, stats } = await tx.dataModel.importTypes({
		sourceQuery: sourceDoc.query,
		records: lnodes,
	})
	// stats -> { reused, preserved, forked }
})
```
