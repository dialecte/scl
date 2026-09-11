---
description: Extract extension for @dialecte/scl v2019C1 — the FSD/ASD/SSD template extractors (built on the transplant engine + layers) plus the TEMPLATE-structure helper.
---

# Extract

The `extract` verb copies an element _out_ of one document and _into_ another, together with its closures. It builds on the [`transplant`](./transplant) engine (`tx.lifecycle.transplant.deep`) and the shared `layers/` take-over, adding three named extractors (`fsd`, `asd`, `ssd`) that produce template FSD/ASD/SSD documents. It also exposes the `ensureSubstationTemplateStructure` helper they use.

```ts
// named extractors (compose the transplant engine + layers with extract policy)
tx.lifecycle.extract.fsd(...)
tx.lifecycle.extract.asd(...)
tx.lifecycle.extract.ssd(...)
// helper
tx.lifecycle.extract.ensureSubstationTemplateStructure()
```

## Transaction methods

Access via `tx.lifecycle.extract` inside a `doc.transaction()` callback. Every method opens a cross-document transaction: it reads from `sourceQuery` and writes into the current `tx`.

### `fsd`

Extracts a `Function`/`SubFunction` into a new FSD template document.

```ts
tx.lifecycle.extract.fsd(params: {
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
3. Clone the function via `cloneFunction` (layers/function) — promote `SubFunction`→`Function`, strip the **root's** `templateUuid` (children keep theirs — subfunctions may be instantiated from other FSDs), apply FSD omit filters, import the type closure.
4. Clone the referenced `FunctionCategory` trees at their structural level.
5. Run post-extraction clean-up (orphan UUID refs, reset LNode bindings to `None`, prune empty containers).

```ts
await targetDoc.transaction(async (tx) => {
	await tx.lifecycle.extract.fsd({
		sourceQuery: sourceDoc.query,
		functionRef: { tagName: 'Function', id: 'func-1' },
		tool: 'Tool name',
		who: 'user@example.com',
	})
})
```

### `asd`

Extracts an `Application` and its content into a new ASD template document.

```ts
tx.lifecycle.extract.asd(params: {
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
3. Clone the Application's functions (via `deep`) and their categories into the structure.
4. Clone the remaining referenced satellites, placing each by mirroring its source hierarchy — a satellite owned by a function lands back under that function's clone — and cloning each target exactly once (satellites already brought in with a function are reused, not duplicated).
5. Run post-extraction clean-up.

### `ssd`

Extracts a `Substation`, `VoltageLevel` or `Bay` and its content into a new SSD template document.

```ts
tx.lifecycle.extract.ssd(params: {
  sourceQuery: Scl.Query
  scopeRef: Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>
  tool: string
  who: string
  nameStructure?: string
}): Promise<{ warnings: string[] }>
```

Steps:

1. Ensure the TEMPLATE substation structure.
2. Write the SSD history header (`fileType: 'SSD'`).
3. Gather the scope's content via `cloneTopologyContent` (layers/topology): its Applications and the Functions they compose, any standalone Functions, and the top-level equipment (including `ConnectivityNode`, so the single-line diagram stays connected) — each with its type closure.
4. Name the selected entrypoint as the reusable root and strip its `templateUuid`; the TEMPLATE ancestors are left untouched.
5. Repoint cloned UUID references and run post-extraction clean-up.

Returns the warnings gathered while extracting — currently one entry when the source has `IED` / `Communication` sections, which are not yet carried into an SSD.

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

`extract` composes shared **engine** + **layer** modules with its own extract-direction policy:

```
lifecycle/
  transplant/transaction/     generic clone mechanism (tx.lifecycle.transplant.deep)
    deep.ts                   clone + content-addressed type closure
    primitives/               clone-tree, clone-referenced
    resolve-structure-ref.ts  structural + ancestry placement
  layers/                     per-layer take-over, shared by extract & instantiate
    function/                 clone-function (cloneFunction, cloneFunctionCategories)
    application/              clone-application
    topology/                 root selection + cloneTopologyContent (SSD scope take-over)
  extract/transaction/        the extract operation (this extension)
    fsd.ts , asd.ts , ssd.ts  file-type extractors
    ensure-substation-structure.ts , post-extraction-cleanup.ts
    omit.ts , omit-filters.ts extract-direction pruning policy
```

> `transplant.deep` is the **mechanism**; `layers/` hold the per-layer **take-over**; `extract` adds the extract-direction **policy** (pruning, TEMPLATE placement, history, root-strip, clean-up). The type engine it composes is [`dataModel.importTypes`](./data-model#importtypes); the content-addressing behind that is [`signature.elementSignature`](./signature).

## Exported types

The [`transplant`](./transplant) module exposes the parameter/result shapes of `deep` and its clone-policy configs for typing call sites.

```ts
import type {
	ImportDeepParams,
	ImportDeepResult,
	StripConfig,
	RetagRootConfig,
} from '@dialecte/scl/v2019C1'
```

| Type               | Description                                                                            |
| ------------------ | -------------------------------------------------------------------------------------- |
| `ImportDeepParams` | Parameters of `deep` (source, refs, `withTypes`, `omit` / `strip` / `retagRoot`).      |
| `ImportDeepResult` | Result of `deep` (`record`, `typeIdRemap`, `recordMappings`).                          |
| `StripConfig`      | Attribute-stripping policy — `{ scope: 'root' \| 'tree'; attributes: string[] }`.      |
| `RetagRootConfig`  | Direction-neutral root tagName retag — `{ from: Scl.ElementsOf; to: Scl.ElementsOf }`. |
