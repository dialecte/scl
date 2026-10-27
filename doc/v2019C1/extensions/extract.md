---
description: Extract extension for @dialecte/scl v2019C1 — the FSD/ASD/SSD template extractors (built on the transplant engine + layers) plus the TEMPLATE-structure helper.
---

# Extract

The `extract` verb copies an element _out_ of one document and _into_ another, together with its closures. It builds on the [`transplant`](./transplant) engine (`tx.lifecycle.transplant.deep`) and the shared `layers/` take-over, adding three named extractors (`fsd`, `asd`, `ssd`) that produce template FSD/ASD/SSD documents. It also exposes the `ensureSubstationTemplateStructure` helper `fsd`/`asd` use to seed their scaffold — `ssd` reproduces its own frame instead (see [below](#ssd)).

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
  as?: 'new' | 'revision'           // default 'new' — see Options
  templateLink?: 'keep' | 'break'   // default 'break' — see Options
}): Promise<void>
```

Steps:

1. Ensure the TEMPLATE substation structure.
2. Write the FSD history header (`fileType: 'FSD'`, via [`history.startFile`](./history#startfile)).
3. Clone the function via `cloneFunction` (layers/function) — promote `SubFunction`→`Function`, apply FSD omit filters, import the type closure.
4. Clone the referenced `FunctionCategory` trees at their structural level.
5. Write the identity ([`identity.writeIdentity`](./identity#writeidentity) in `strip` mode): the function extracted is a new template, its template link (`templateUuid`) is broken and the file it was placed from (its own `FunctionSclRef`) is no longer recorded; what it holds and its categories keep their lineage, and a subfunction placed from another FSD keeps its `FunctionSclRef`. The cloned uuid references are repointed.
6. Run post-extraction clean-up (orphan UUID refs, reset LNode bindings to `None`, prune empty containers).

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
  as?: 'new' | 'revision'
  templateLink?: 'keep' | 'break'
}): Promise<void>
```

Steps:

1. Ensure the TEMPLATE substation structure.
2. Write the ASD history header (`fileType: 'ASD'`), the file named after the application (`ASD_<name>`).
3. Clone the Application's functions (via `deep`) and their categories into the structure.
4. Clone the remaining referenced satellites, placing each by mirroring its source hierarchy — a satellite owned by a function lands back under that function's clone — and cloning each target exactly once (satellites already brought in with a function are reused, not duplicated).
5. Write the identity: the `Application` extracted loses its template link (`templateUuid` and `originUuid`) and its own `ApplicationSclRef`; its functions, roles and categories keep their lineage, and its functions the `FunctionSclRef` of the FSD each was placed from. The cloned uuid references are repointed.
6. Run post-extraction clean-up.

### `ssd`

Extracts a `Substation`, `VoltageLevel` or `Bay` and its content into a new SSD template document.

```ts
tx.lifecycle.extract.ssd(params: {
  sourceQuery: Scl.Query
  scopeRef: Scl.Ref<'Substation'> | Scl.Ref<'VoltageLevel'> | Scl.Ref<'Bay'>
  tool: string
  who: string
  nameStructure?: string
  as?: 'new' | 'revision'
  templateLink?: 'keep' | 'break'
}): Promise<{ warnings: ExtractWarning[] }>
```

Steps:

1. Write the SSD history header (`fileType: 'SSD'`).
2. Gather the scope's content via `cloneTopologyContent` (layers/topology): it REPRODUCES the source's own structural frame above and at the scope — only the levels the scope actually has (`Substation`/`VoltageLevel`/`Bay`, each with its own `BayType`, equipment and connectivity, including `ConnectivityNode` so the single-line diagram stays connected) — then consumes the application/function layers for the Applications and the Functions they compose, plus any standalone Functions, each with its type closure. Several voltage levels/bays in the scope each get their own reproduced level, never collapsed together.
3. TEMPLATE-name the reproduced ancestors above the selected entrypoint; the entrypoint itself keeps the source name, becoming the reusable root.
4. Write the identity: the entrypoint and the `TEMPLATE` levels above it lose their template link; what the entrypoint holds — equipment, applications, functions — keeps its lineage, and its applications and functions the `ApplicationSclRef` / `FunctionSclRef` of the file each was placed from. Repoint cloned UUID references and run post-extraction clean-up.

Returns the warnings gathered while extracting (`ExtractWarning`, a `code` and its data, for the caller to word) — currently one, when the source has `IED` / `Communication` sections, which are not yet carried into an SSD:

```ts
{ code: 'sections-not-carried', counts: { IED: number, Communication: number } }
```

### Options

The three extracts take the same options (`ExtractOptions`):

- `as` — the file written. `'new'` (default): a new template, a `Header` with a uuid of its own, version `0`, revision `1`. `'revision'`: a new revision of the template the element came from (its uuid, the next revision) — not available yet, refused with `OPTION_NOT_AVAILABLE` (`meta: { option: 'as', value: 'revision' }`) before anything is written.
- `templateLink` — whether the element extracted stays an instance of the template it was made from. `'break'` (default): it loses its `templateUuid` and `originUuid`. `'keep'`: it keeps them, and the file reference it records. What it holds keeps its lineage and its file references either way; the `TEMPLATE` levels above an SSD's entrypoint carry none.

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
    topology/                 root selection + frame reproduction + cloneTopologyContent (SSD take-over)
      ensure-topology-frame.ts    reproduces the structural frame by position (Substation/VL/Bay)
      reconcile-topology-frame.ts reconciles the frame's own content onto an existing instance
  extract/transaction/        the extract operation (this extension)
    fsd.ts , asd.ts , ssd.ts  file-type extractors
    ensure-substation-structure.ts , post-extraction-cleanup.ts
    omit.ts , omit-filters.ts extract-direction pruning policy
```

> `transplant.deep` is the **mechanism**; `layers/` hold the per-layer **take-over**; `extract` adds the extract-direction **policy** (pruning, TEMPLATE placement, history, the root's template link broken, clean-up). The type engine it composes is [`dataModel.importTypes`](./data-model#importtypes); the content-addressing behind that is [`signature.elementSignature`](./signature).

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
| `ImportDeepResult` | Result of `deep` (`record`, `typeIdRemap`, `cloneMappings`).                           |
| `StripConfig`      | Attributes a clone drops — `{ scope: 'root' \| 'tree'; attributes: string[] }`.        |
| `RetagRootConfig`  | Direction-neutral root tagName retag — `{ from: Scl.ElementsOf; to: Scl.ElementsOf }`. |
