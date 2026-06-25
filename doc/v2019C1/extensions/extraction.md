---
description: Extraction extension for @dialecte/scl v2019C1 — import an element with its reference and type closure (deep), plus the FSD/ASD template recipes.
---

# Extraction

The `extraction` extension copies an element _out_ of one document and _into_ another, together with its closures. It has one generic engine — `deep` — and two named **recipes** built on top of it that produce template FSD/ASD documents. It also exposes the `ensureSubstationTemplateStructure` helper the recipes use.

> Replaces the former `import` and `template` extensions. `tx.template.extractToFsd` / `extractToAsd` are now `tx.extraction.toFsd` / `toAsd`.

```ts
// generic
tx.extraction.deep(...)
// named recipes
tx.extraction.toFsd(...)
tx.extraction.toAsd(...)
// helper
tx.extraction.ensureSubstationTemplateStructure()
```

## Transaction methods

Access via `tx.extraction` inside a `doc.transaction()` callback. Every method opens a cross-document transaction: it reads from `sourceQuery` and writes into the current `tx`.

### `deep`

Imports an element subtree into `targetParent` together with its closures, in this order:

1. **forward uuid-reference closure** (`withReferences`, default `true`) — clones referenced satellites missing in the target (create-if-missing). Run _first_, so the cloned subtree's references remap onto the new satellites.
2. **subtree clone** — clones the element under `targetParent` (with optional `omit` / `strip` / `promoteRoot`).
3. **content-addressed type closure** (`withTypes`, default `true`) — reconciles the LN/LNode type closure via `dataModel.importTypes` and repoints the cloned instances' `lnType` through the clone mappings.

```ts
tx.extraction.deep(params: {
  sourceQuery: Scl.Query
  ref: Scl.Ref<Scl.ElementsOf>            // element to import
  targetParent: Scl.Ref<Scl.ElementsOf>   // where the subtree is cloned
  withTypes?: boolean                      // default true
  withReferences?: boolean                 // default true
  skipReferences?: ReadonlySet<string>     // ref tag names to skip in the uuid closure
  omit?: OmitEntry[]                        // child tags to drop from the clone
  strip?: StripConfig | false              // default false (preserve provenance)
  promoteRoot?: { from: Scl.ElementsOf; to: Scl.ElementsOf }
}): Promise<{ record: Scl.RawRecord<Scl.ElementsOf>; idRemap: Map<string, string> }>
```

`deep` is a faithful copy-out: it does **not** reset IED bindings, strip template attributes, or clean up orphans — those are recipe policies (see `toFsd` / `toAsd`).

```ts
await targetDoc.transaction(async (tx) => {
	await tx.extraction.deep({
		sourceQuery: sourceDoc.query,
		ref: { tagName: 'Function', id: 'func-1' },
		targetParent: { tagName: 'Bay', id: 'bay-1' },
	})
})
```

### `toFsd`

Extracts a `Function`/`SubFunction` into a new FSD template document.

```ts
tx.extraction.toFsd(params: {
  sourceQuery: Scl.Query
  functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>
  tool: string
  who: string
  nameStructure?: string
}): Promise<void>
```

Steps:

1. Ensure the TEMPLATE substation structure.
2. Write the FSD history header (`fileType: 'FSD'`).
3. Clone the function via `deep` — promote `SubFunction`→`Function`, strip `templateUuid`, apply FSD omit filters, import the type closure.
4. Clone the referenced `FunctionCategory` trees at their structural level.
5. Run post-extraction clean-up (orphan UUID refs, reset LNode bindings to `None`, prune empty containers).

```ts
await targetDoc.transaction(async (tx) => {
	await tx.extraction.toFsd({
		sourceQuery: sourceDoc.query,
		functionRef: { tagName: 'Function', id: 'func-1' },
		tool: 'Tool name',
		who: 'user@example.com',
	})
})
```

### `toAsd`

Extracts an `Application` and its content into a new ASD template document.

```ts
tx.extraction.toAsd(params: {
  sourceQuery: Scl.Query
  applicationRef: Scl.Ref<'Application'>
  tool: string
  who: string
  nameStructure?: string
}): Promise<void>
```

Steps:

1. Ensure the TEMPLATE substation structure.
2. Write the ASD history header (`fileType: 'ASD'`).
3. Clone the Application's functions, categories and referenced satellites into the structure (functions via `deep`).
4. Run post-extraction clean-up.

### `ensureSubstationTemplateStructure`

Ensures the mandatory `TEMPLATE` hierarchy exists under the root `SCL`, creating each level if absent. Idempotent — safe to call multiple times.

```
SCL
└── Substation[name="TEMPLATE"]
    └── VoltageLevel[name="TEMPLATE"]
        └── Bay[name="TEMPLATE"]
```

```ts
ensureSubstationTemplateStructure(): Promise<{
  Substation: Scl.RawRecord<'Substation'>
  VoltageLevel: Scl.RawRecord<'VoltageLevel'>
  Bay: Scl.RawRecord<'Bay'>
}>
```

## Internal structure

```
extraction/transaction/
  deep.ts                 generic import (uuid closure + clone + type closure)
  primitives/             generic, policy-free mechanism
    clone-tree.ts         getTree → promote → strip → deepClone
    clone-referenced.ts   forward uuid-reference closure (create-if-missing)
  recipes/                template products + their bricks
    fsd/ , asd/
    shared/               clone-function, ensure-substation-structure,
                          resolve-structure-ref, post-extraction-cleanup, omit-filters
```

> `deep` is the **mechanism**; the recipes are **policy** (pruning, structural placement, transforms, history, clean-up). The type engine it composes is [`dataModel.importTypes`](./data-model#importtypes); the content-addressing behind that is [`signature.elementSignature`](./signature).
