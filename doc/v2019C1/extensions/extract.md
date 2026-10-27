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
  templateLink?: 'keep' | 'break'   // default 'keep' — see Options
  sections?: FunctionSections       // every section kept by default — see Options
  placement?: 'source-level' | 'substation' | 'function-template' // default 'source-level' — see below
}): Promise<void>
```

Steps:

1. Write the FSD history header (`fileType: 'FSD'`, via [`history.startFile`](./history#startfile)).
2. With `placement: 'function-template'`, refuse what a function template cannot hold (below): the transaction is refused, nothing is written.
3. Place the function (`placement`):
   - `'source-level'` (default): at the level it sits at in the source — a bay function below the `TEMPLATE` bay, a voltage-level function below the `TEMPLATE` voltage level, a substation function below the `TEMPLATE` substation (a subfunction at the level of the function holding it). The level an FSD's function sits at is the highest level it may be placed at; the `TEMPLATE` substation, voltage level and bay are written whatever the level (a substation holds a voltage level, a voltage level a bay). A function in a line or a process is refused with `OPTION_NOT_AVAILABLE` (`meta: { option: 'placement', value: 'source-level' }`): an FSD holding it at such a level is not written yet; extract it below the `TEMPLATE` substation or as a function template.
   - `'substation'`: below the `TEMPLATE` substation, whatever its level.
   - `'function-template'`: as a `FunctionTemplate` (its subfunctions as `SubFunctionTemplate`) in the document root's `eIEC61850-6-100` `Private`, with no level: a template that may be placed at every level. The dialecte writes in a function template its logical nodes (with what they specify), its subfunction templates and its equipment, and no `Private` yet: a function holding anything else at its own or a subfunction's level (labels, process resources, power system relations, behaviour descriptions, variables, a subfunction's `FunctionSclRef`, a vendor `Private`), or classified in a category (a category has no level to sit at), is refused with `FUNCTION_TEMPLATE_CANNOT_HOLD` (`SCL2004`, `meta: { tags }`), nothing written: leave those sections out, or place it at a level. The function's own `FunctionSclRef` is refused while its template link is kept; with `templateLink: 'break'` it goes with the link.
4. Clone the function via `cloneFunction` (layers/function) — promote `SubFunction`→`Function`, leave out the sections the caller leaves out, import the type closure.
5. Clone the referenced `FunctionCategory` trees at their structural level (unless `sections.categories` is `false`).
6. Write the identity ([`identity.writeIdentity`](./identity#writeidentity) in `strip` mode): by default the function and what it holds keep their lineage and the files they record. With `templateLink: 'break'` the function and what came with its instance lose their template link, and the function its own `FunctionSclRef`; a subfunction placed from another FSD keeps its lineage and its `FunctionSclRef`, with what it holds. The categories keep their lineage. The cloned uuid references are repointed.
7. Run post-extraction clean-up (orphan UUID refs, reset LNode bindings to `None`, prune empty containers).

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
  sections?: { equipment?: boolean } // the equipment the functions hold, kept by default
}): Promise<void>
```

Steps:

1. Ensure the TEMPLATE substation structure.
2. Write the ASD history header (`fileType: 'ASD'`), the file named after the application (`ASD_<name>`).
3. Clone the Application's functions (via `deep`, with the equipment they hold unless `sections.equipment` is `false`) and their categories into the structure.
4. Clone the remaining referenced satellites, placing each by mirroring its source hierarchy — a satellite owned by a function lands back under that function's clone — and cloning each target exactly once (satellites already brought in with a function are reused, not duplicated).
5. Write the identity: by default the `Application` and what it composes keep their lineage and the files they record. With `templateLink: 'break'` the application loses its template link (`templateUuid` and `originUuid`) and its own `ApplicationSclRef`, and so does what came with its instance — what it holds, and a function it composes that records no file of its own; a function placed from its FSD keeps its lineage and `FunctionSclRef`. The application's own function roles came with it; the allocation roles and the categories it refers to are shared and keep their lineage. The cloned uuid references are repointed.
6. Run post-extraction clean-up.

### `ssd`

Extracts a `Substation`, `VoltageLevel` or `Bay` and its content into a new SSD template document. A voltage level or a bay is the template's unit: the element another project instantiates from it. A substation is the template's top element, named `TEMPLATE`: each of its voltage levels is a unit (a project instantiating the file names one of them when there are several, or gets `SSD_SCOPE_AMBIGUOUS` listing them). What the substation holds outside its voltage levels (its own functions, power transformers, equipment) is written with the `TEMPLATE` substation and is part of no unit: an instantiation brings it only when an application of the unit composes it.

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
2. Gather the scope's content via `cloneTopologyContent` (layers/topology): it REPRODUCES the source's own structural frame above and at the scope — only the levels the scope actually has (`Substation`/`VoltageLevel`/`Bay`, each with its own `BayType`, equipment and connectivity, including `ConnectivityNode` so the single-line diagram stays connected) — then consumes the application/function layers for the Applications and the Functions they compose — a Function several Applications compose is placed once, each referring to it —, plus any standalone Functions, each with its type closure. Several voltage levels/bays in the scope each get their own reproduced level, never collapsed together.
3. TEMPLATE-name the scaffolding: the reproduced levels above the units — above a voltage level or a bay, and a substation itself. The units keep their source names: they are the elements instantiated.
4. Write the identity: the `TEMPLATE` levels lose their template link; the units and what they hold keep theirs by default. With `templateLink: 'break'` the element extracted and what came with its instance lose it — what it holds, and the functions its applications compose wherever they sit, unless an element records a file of its own; an application or a function placed from its file keeps its lineage and its `ApplicationSclRef` / `FunctionSclRef`. Repoint cloned UUID references and run post-extraction clean-up.

Returns the warnings gathered while extracting (`ExtractWarning`, a `code` and its data, for the caller to word) — currently one, when the source has `IED` / `Communication` sections, which are not yet carried into an SSD:

```ts
{ code: 'sections-not-carried', counts: { IED: number, Communication: number } }
```

### Options

The three extracts take `as` and `templateLink` (`ExtractOptions`); `extract.fsd` and `extract.asd` take `sections` too, `extract.fsd` `placement` (see its steps):

- `as` — the file written. `'new'` (default): a new template, a `Header` with a uuid of its own, version `0`, revision `1`. `'revision'`: a new revision of the template the element came from (its uuid, the next revision) — not available yet, refused with `OPTION_NOT_AVAILABLE` (`meta: { option: 'as', value: 'revision' }`) before anything is written.
- `sections` (`extract.fsd`; `extract.asd` takes `equipment` only) — what the function holds besides its logical nodes and subfunctions, each optional in an FSD, each written unless set `false` (`FunctionSections`):

  | Section                | Elements                                              | Where                                          |
  | ---------------------- | ----------------------------------------------------- | ---------------------------------------------- |
  | `dataSpecification`    | `DOS` (with its `SDS` / `DAS`)                        | under a logical node                           |
  | `inputs` / `outputs`   | `LNodeInputs` / `LNodeOutputs`                        | under a logical node                           |
  | `labels`               | `Labels`                                              | under the function, a logical node or its data |
  | `processResources`     | `ProcessResources`                                    | under the function                             |
  | `powerSystemRelations` | `PowerSystemRelations`                                | under the function                             |
  | `behaviorDescriptions` | `BehaviorDescription`                                 | under the function or a logical node           |
  | `variables`            | `Variable`                                            | under the function                             |
  | `equipment`            | `GeneralEquipment`, `ConductingEquipment`             | under the function                             |
  | `categories`           | the `FunctionCategory` trees classifying the function | beside it                                      |

  A section is left out at every depth of the function. A reference to what a section left out is cleaned up with the rest (a `PowerSystemRelation` to the function's equipment goes with the equipment).

- `templateLink` — whether the element extracted stays an instance of the template it was made from. `'keep'` (default): it keeps its `templateUuid` and `originUuid`, and the file reference it records — a copy of an instance is still one. `'break'`: it loses them, and so does what came with its instance (the elements below it, and for an application the functions it composes, unless an element records a source file of its own: a subfunction placed from another FSD, an application or a function placed from its file keeps its lineage and file reference, with what it holds). The `TEMPLATE` levels of an SSD carry no lineage either way.

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
    function-sections.ts      the sections of a function an extract leaves out
    function-placement.ts     where an FSD holds its function, what a function template cannot hold
    instance-content.ts       what came with an instance: what breaking its template link reaches
```

> `transplant.deep` is the **mechanism**; `layers/` hold the per-layer **take-over**; `extract` adds the extract-direction **policy** (the sections left out, the placement, history, the template link kept or broken, clean-up). The type engine it composes is [`dataModel.importTypes`](./data-model#importtypes); the content-addressing behind that is [`signature.elementSignature`](./signature).

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
