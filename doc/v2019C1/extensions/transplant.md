---
description: Transplant engine for @dialecte/scl v2019C1 — the shared clone primitive (deep) that moves an SCL subtree, with its type closure, between documents.
---

# Transplant

The `transplant` verb is the **engine** behind the lifecycle content operations. It moves an SCL subtree — together with its content-addressed type closure — from one document into another. Both [extract](./extract) (project → template) and [instantiate](./instantiate) (template → project) are _directions_ built on top of it.

```ts
tx.lifecycle.transplant.deep(...)
```

## Transaction methods

Access via `tx.lifecycle.transplant` inside a `doc.transaction()` callback. `deep` opens a cross-document transaction: it reads from `sourceQuery` and writes into the current `tx`.

### `deep`

`deep({ sourceQuery, ref, targetParent, omit?, strip?, promoteRoot?, withTypes? })` imports an element subtree into `targetParent` together with its type closure, in this order:

1. **subtree clone** — clones the element under `targetParent` (with optional `omit` / `strip` / `promoteRoot`).
2. **content-addressed type closure** (`withTypes`, default `true`) — reconciles the LN/LNode type closure via `dataModel.importTypes` and repoints the cloned instances' `lnType` through the clone mappings.

`deep` is a **faithful** subtree copy: it does _not_ follow forward uuid references, reset IED bindings, strip template attributes, or clean up orphans. Reference rewiring and identity stamping are the caller's responsibility (see [extract](./extract), [instantiate](./instantiate) and [identity](./identity)). It returns the full `recordMappings` (source → clone for every node) so callers can locate any cloned node in the target.

```ts
tx.lifecycle.transplant.deep(params: {
  sourceQuery: Scl.Query
  ref: Scl.Ref<Scl.ElementsOf>            // element to import
  targetParent: Scl.Ref<Scl.ElementsOf>   // where the subtree is cloned
  withTypes?: boolean                      // default true
  omit?: OmitEntry[]                        // child tags to drop from the clone
  strip?: StripConfig | false              // default false (preserve provenance)
  promoteRoot?: { from: Scl.ElementsOf; to: Scl.ElementsOf }
}): Promise<{
  record: Scl.RawRecord<Scl.ElementsOf>    // cloned root
  typeIdRemap: Map<string, string>         // source type id → reconciled target type id (DataTypeTemplates)
  recordMappings: Scl.CloneMapping[]       // source record → target record, for the whole cloned subtree
}>
```

```ts
await targetDoc.transaction(async (tx) => {
	await tx.lifecycle.transplant.deep({
		sourceQuery: sourceDoc.query,
		ref: { tagName: 'Function', id: 'func-1' },
		targetParent: { tagName: 'Bay', id: 'bay-1' },
	})
})
```
