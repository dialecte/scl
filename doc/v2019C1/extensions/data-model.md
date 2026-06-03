---
description: Data Model extension for @dialecte/scl v2019C1 — resolve and extract LNodeType/DOType/DAType/EnumType trees.
---

# Data Model

The `dataModel` extension resolves the IEC 61850 data model for `LNode` and `LN` records, and copies the required types into a target `DataTypeTemplates` section.

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

### `extract`

Resolves the data model from `sourceQuery`, then deep-clones any `LNodeType`, `DOType`, `DAType`, and `EnumType` that are not already present (by `id`) in the current transaction's `DataTypeTemplates`. Creates `DataTypeTemplates` if absent.

```ts
extract(params: {
  sourceQuery: Scl.Query
  records: (Scl.TrackedRecord<'LNode'> | Scl.TrackedRecord<'LN'>)[]
}): Promise<void>
```

Typical use: when extracting a function to a new `.fsd` file, copy the data model types the function depends on.

```ts
const sourceDoc = project.openDocument(sourceDocumentId)
const targetDoc = project.openDocument(targetDocumentId)

const { LNode: lnodes = [] } = await sourceDoc.query.findDescendants(functionRecord)

await targetDoc.transaction(async (tx) => {
	await tx.dataModel.extract({ sourceQuery: sourceDoc.query, records: lnodes })
})
```
