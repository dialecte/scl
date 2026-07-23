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

`deep({ sourceQuery, ref, targetParent, omit?, strip?, retagRoot?, withTypes? })` imports an element subtree into `targetParent` together with its type closure, in this order:

1. **subtree clone** — clones the element under `targetParent` (with optional `omit` / `strip` / `retagRoot`).
2. **content-addressed type closure** (`withTypes`, default `true`) — reconciles the `LNode`/`LN`/`LN0` type closure via `dataModel.importTypes` and repoints the cloned instances' `lnType` through the clone mappings. Pass `withTypes: { keepNameFrom: 'source' | 'target' }` to choose which side keeps the type name on a dedup (`'target'` default = destination is the naming authority); `withTypes: false` skips the closure for a bare subtree copy.

`deep` is a **faithful** subtree copy: it does _not_ follow forward uuid references, reset IED bindings, strip template attributes, or clean up orphans. Reference rewiring and identity stamping are the caller's responsibility (see [extract](./extract), [instantiate](./instantiate) and [identity](./identity)). It returns the full `recordMappings` (source → clone for every node) so callers can locate any cloned node in the target.

```ts
tx.lifecycle.transplant.deep(params: {
  sourceQuery: Scl.Query
  ref: Scl.Ref<Scl.ElementsOf>            // element to import
  targetParent: Scl.Ref<Scl.ElementsOf>   // where the subtree is cloned
  withTypes?: boolean | { keepNameFrom?: 'source' | 'target' } // default true; object picks the dedup name authority
  omit?: OmitEntry[]                        // child tags to drop from the clone
  strip?: StripConfig | false              // default false (preserve provenance)
  retagRoot?: { from: Scl.ElementsOf; to: Scl.ElementsOf } // direction-neutral root retag (e.g. instantiate Function->SubFunction, extract SubFunction->Function)
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

## Private preservation

Because `deep` is a faithful copy, vendor `Private` elements are cloned **verbatim**, including ones that carry no child elements:

- **text-only** privates whose payload is their value (e.g. `<Private type="Siemens-MasterId">…</Private>`);
- **empty flag** privates whose meaning is their mere presence (e.g. `<Private type="Siemens-IsSiprotec5IED"/>`);
- **namespaced** privates wrapping foreign-namespace content (e.g. `<Private type="eIEC61850-6-100"><eIEC61850-6-100:SsdReference/></Private>`).

Only a **truly-empty** `Private` — no child elements, no text value, and no `type` — is dropped as noise. This applies to every `transplant.deep` consumer (extract, instantiate, and the layer clones).
