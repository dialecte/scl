---
description: Extract extension for @dialecte/scl v2019C1 — the FSD/ASD template recipes (built on the transplant engine) plus the TEMPLATE-structure helper.
---

# Extract

The `extract` extension copies an element _out_ of one document and _into_ another, together with its closures. It builds on the [`transplant`](./transplant) engine (`tx.transplant.deep`) and adds two named **recipes** that produce template FSD/ASD documents. It also exposes the `ensureSubstationTemplateStructure` helper the recipes use.

```ts
// named recipes (use the `transplant` engine internally — see tx.transplant.deep)
tx.extract.fsd(...)
tx.extract.asd(...)
// helper
tx.extract.ensureSubstationTemplateStructure()
```

## Transaction methods

Access via `tx.extract` inside a `doc.transaction()` callback. Every method opens a cross-document transaction: it reads from `sourceQuery` and writes into the current `tx`.

### `fsd`

Extracts a `Function`/`SubFunction` into a new FSD template document.

```ts
tx.extract.fsd(params: {
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
	await tx.extract.fsd({
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
tx.extract.asd(params: {
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
extract/transaction/
  deep.ts                 generic import (clone + type closure)
  primitives/             generic, policy-free mechanism
    clone-tree.ts         getTree → promote → strip → deepClone
    clone-referenced.ts   satellite clone — resolve missing referenced targets,
                          dedup against already-cloned records, place per a resolver
  recipes/                template products + their bricks
    fsd/ , asd/
    shared/               clone-function, ensure-substation-structure,
                          resolve-structure-ref (structural + ancestry placement),
                          post-extraction-cleanup, omit-filters
```

> `deep` is the **mechanism**; the recipes are **policy** (pruning, structural placement, transforms, history, clean-up). The type engine it composes is [`dataModel.importTypes`](./data-model#importtypes); the content-addressing behind that is [`signature.elementSignature`](./signature).

## Exported types

The `extract` module re-exports the parameter/result shapes of `deep` and its clone-policy configs for typing call sites and authoring custom recipes.

```ts
import type {
	ImportDeepParams,
	ImportDeepResult,
	StripConfig,
	PromoteRootConfig,
} from '@dialecte/scl/v2019C1'
```

| Type                | Description                                                                         |
| ------------------- | ----------------------------------------------------------------------------------- |
| `ImportDeepParams`  | Parameters of `deep` (source, refs, `withTypes`, `omit` / `strip` / `promoteRoot`). |
| `ImportDeepResult`  | Result of `deep` (`record`, `typeIdRemap`, `recordMappings`).                       |
| `StripConfig`       | Attribute-stripping policy — `{ scope: 'root' \| 'tree'; attributes: string[] }`.   |
| `PromoteRootConfig` | Root tagName promotion — `{ from: Scl.ElementsOf; to: Scl.ElementsOf }`.            |
