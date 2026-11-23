---
description: Specification extension for @dialecte/scl v2019C1 — what an allocation role holds, which IEDs implement it, and building a specification IED from logical nodes.
---

# Specification

The `specification` extension reads the specification side of a project: which logical nodes an allocation role holds
and how far they are implemented, and what is left to implement on a real IED; and it builds the data model of a
specification IED from logical nodes.

## Query methods

Access via `doc.query.specification`.

### `roleLNodes`

The logical nodes of an allocation role, the IEDs implementing them, and the ones not implemented yet.

```ts
doc.query.specification.roleLNodes(params: {
  allocationRole: Scl.Ref<'AllocationRole'>
}): Promise<RoleLNodes>

type RoleLNodes = {
  lnodes: Scl.Ref<'LNode'>[]                 // every LNode below the functions the role names, once, document order
  implementers: {
    ied: Scl.Ref<'IED'>
    name: string
    kind: 'implemented' | 'specification'    // the rule of lifecycle.classifyIeds
    lnodes: Scl.Ref<'LNode'>[]               // the role's LNodes this IED implements
  }[]                                        // document order of the IEDs
  unimplemented: Scl.Ref<'LNode'>[]          // LNodes no logical node implements
  unresolvedFunctionRefs: Scl.Ref<'FunctionRef'>[] // references naming no function
}
```

- **The functions of a role** — each `FunctionRef` names its function by `functionUuid`, else (no uuid, or one naming
  nothing) by its `function` path, as `reference.resolveReferencePaths` resolves it. A
  function nested in another one the role names adds nothing twice; LNodes of nested subfunctions and equipment
  functions count.
- **A role names no IED** — the implementers are read from the LNodes: the LN their `lnUuid` or their name path names
  (as `reference.resolveMappedLNodes`). An LNode left unassigned (`iedName` "None" or absent, no `lnUuid`) whose `DOS`,
  `SDS` or `DAS` names an LN by `mappedLnUuid` counts as implemented by that LN's IED (a real IED's, when its data names LNs of several IEDs): several LNodes implemented by one
  logical node keep their specification and document the mapping in their data.
- **Several IEDs, several roles** — one role may be implemented by several IEDs, and one IED may serve several roles:
  the answer lists every implementer, it never refuses.
- **Specification IEDs** — an LNode bound to a specification IED is listed under it with `kind: 'specification'`; it
  is specified, not implemented by a real device.
- Refuses with `ELEMENT_NOT_FOUND` when the document holds no such allocation role.
- A fixed number of reads, whatever the size of the role.

```ts
const { implementers, unimplemented } = await doc.query.specification.roleLNodes({ allocationRole })
// implementers → [{ ied, name: 'P1', kind: 'implemented', lnodes: [...] }]
// unimplemented → the LNodes still waiting for a device
```

### `toImplement`

What is still to implement on a real IED.

```ts
doc.query.specification.toImplement(params: { ied: Scl.Ref<'IED'> }): Promise<ToImplement>

type ToImplement = {
  specifiedAs: string[]                // the specification IED names of what the IED implements, sorted
  lnodes: Scl.Ref<'LNode'>[]           // LNodes specified on those names no real IED implements, document order
  otherImplementers: { ied: Scl.Ref<'IED'>; name: string }[] // other real IEDs implementing LNodes specified on them
  reason?: 'not-implemented-ied' | 'no-specification-name'
}
```

- **Specified as** — the `sIedName` of the `LNodeSpecNaming` of every LNode the IED implements: the naming keeps the
  specification once an LNode is mapped.
- **Still to implement** — every LNode of the process section (function templates left out) specified on one of those
  names that no real IED implements. Implemented counts every real IED, an LNode implemented with others by one logical
  node (its `DOS` / `SDS` / `DAS` naming the LN by `mappedLnUuid`) included. An LNode mapped to a specification IED is
  still to implement: it is specified, not implemented.
- **One specification IED, several real IEDs** — nothing in the data says which real IED an LNode left is meant for:
  it is listed for each, and `otherImplementers` names the other real IEDs sharing the specification.
- `reason: 'not-implemented-ied'` when the IED given is a specification IED; `reason: 'no-specification-name'` when no
  LNode it implements carries a specification IED name (never guessed from its own name). Both with empty lists.
- Refuses with `ELEMENT_NOT_FOUND` when the document holds no such IED. A fixed number of reads.

```ts
const { specifiedAs, lnodes, otherImplementers } = await doc.query.specification.toImplement({
	ied,
})
```

### `planIed`

What building a specification IED's data model from these logical nodes would create, bind, leave out or refuse,
without writing: the plan `tx.specification.buildIed` writes (same parameters, see below).

```ts
doc.query.specification.planIed(params: BuildIedParams): Promise<IedBuildPlan>

type IedBuildPlan = {
  lDevices: { inst: string; from: Scl.Ref<LNodeContainerTag> | 'lnode-ldInst'; existing?: Scl.Ref<'LDevice'> }[]
  logicalNodes: {
    lnode: Scl.Ref<'LNode'>; lDeviceInst: string; kind: 'LN0' | 'LN'
    identity: { prefix: string; lnClass: string; inst: string }; lnType: string
    existing?: Scl.Ref<'LN' | 'LN0'> // already built and bound to this LNode
  }[]
  added: { lDeviceInst: string; kind: 'LN0' | 'LPHD'; lnType: string }[] // LN0 and LPHD a logical device lacks
  leftOut: { lnode: Scl.Ref<'LNode'>; reason: 'implemented-elsewhere'; ied: Scl.Ref<'IED'> }[]
  openValuesUsed: { point: 'ldInst' | 'lnType'; element: Scl.Ref; value: string }[] // every value a rule gave
  refusals: { reason: BuildRefusalReason; ref?: Scl.Ref; detail: string }[] // empty when the build can be written
}
```

A fixed number of reads, whatever the number of logical nodes. Refuses with `ELEMENT_NOT_FOUND` when the document
holds no such IED or LNode.

## Transaction methods

Access via `tx.specification`.

### `buildIed`

Builds the data model of a specification IED from logical nodes and binds each logical node to its own.

```ts
tx.specification.buildIed(params: BuildIedParams): Promise<IedBuildResult>

type BuildIedParams = {
  ied: Scl.Ref<'IED'>                 // a specification IED
  lnodes: readonly Scl.Ref<'LNode'>[]
  server?: Scl.Ref<'Server'>          // required only when the IED has several servers
  prefixFromLeafSubFunction?: boolean // default false
  openValues?: { ldInst?: OpenValueRule<LdInstContext>; lnType?: OpenValueRule<LnTypeContext> }
  contextQuery?: Core.Query<Config>   // the document deciding name clashes and offering types; default the one built in
  ldNameAlsoFits?: readonly string[] // other IED names each logical device name must fit too (an IED renamed later)
  excludeFunctionalConstraints?: readonly string[] // values of these functional constraints left out (see Values)
}
type IedBuildResult = {
  plan: IedBuildPlan
  created: { lDevices: Scl.Ref<'LDevice'>[]; logicalNodes: Scl.Ref<'LN' | 'LN0'>[] }
  bound: Scl.Ref<'LNode'>[]
}
```

- **Logical devices** — an LNode's own `ldInst` names its logical device. Otherwise its nearest function or equipment
  function, or subfunction holding subfunctions, is one logical device; a subfunction holding none adds its logical
  nodes to the logical device of the function above it. The name is the function's: characters other than letters,
  digits and `_` become `_`, runs of `_` collapse, leading `_` go. Two elements of the document giving the same name
  each get the name of the level above them in front (`Q01_PROT`, `Q02_PROT`); the whole document decides, so a
  function's logical device has the same name in every IED built from it. A name still clashing, empty, or making the
  logical device name (IED name followed by the inst) longer than 64 is refused; with `ldNameAlsoFits`, the longest of
  the IED's name and those names counts. A logical device of that name already
  in the IED is reused only when it holds no logical node bound from another element.
- **Logical nodes** — one LN per LNode, its prefix, class, instance and type the LNode's; an `LLN0` LNode is the LN0.
  With `prefixFromLeafSubFunction`, an LNode without prefix in a subfunction holding none takes the subfunction's name
  as prefix (prefix, class and instance at most 13). Two LNodes giving one logical node in a logical device are refused.
- **Added** — every logical device gets an LN0 and an LPHD (`inst="1"`) when no LNode gives one.
- **Bound** — each LNode gets `lnUuid` = its logical node's uuid; its names and its specification naming follow.
- **Implemented elsewhere** — an LNode another IED implements is left out and listed in `plan.leftOut`; the rest is
  built.
- **Built again** — an LNode the IED already implements keeps its logical node: building twice writes nothing.
- **Open values** — no type is given for an LNode without `lnType`, nor for an added LN0 or LPHD, and the logical
  device of an LNode in no function has no name. The caller's `openValues` rules answer them; an answer is judged as
  the engine's own (a name: its pattern, its length, the clash rule; a type: one of the candidates of the class, in
  the document built in) and listed in `plan.openValuesUsed`. Without an answer the build is refused. An `lnType`
  naming no LNodeType is a broken reference: refused, never asked.
- Refuses before any write with `SPECIFICATION_BUILD_REFUSED`: `meta.refusals` lists every refusal, `meta.reason` is
  the first one's.

| reason                  | when                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `not-specification-ied` | the IED is a real device's (an ICD or IID among its source files)                                                                            |
| `lnode-outside-process` | the LNode is not in a substation, line or process (a function template's)                                                                    |
| `server`                | the IED has no server, or several and none (or one it does not hold) is given                                                                |
| `no-function`           | the LNode has no `ldInst`, no function holds it and no `ldInst` rule names its logical device                                                |
| `ld-name`               | a logical device name empty, still clashing, too long, or already used by another element's logical device                                   |
| `ln-name`               | an LNode without valid instance, prefix and instance longer than 12, an LLN0 with a prefix, a subfunction name that does not fit as a prefix |
| `ln-collision`          | two LNodes giving one logical node, or a logical node of that identity already in the logical device                                         |
| `type-missing`          | no type: the LNode names none and no rule answers, or names a type the document lacks                                                        |
| `type-mismatch`         | the type is of another logical node class                                                                                                    |
| `open-value-invalid`    | a rule's answer fails the check the engine applies to its own                                                                                |

```ts
import { firstOf, firstOfClass, sameClassInTargetIed } from '@dialecte/scl/v2019C1'

const { plan, created } = await tx.specification.buildIed({
	ied,
	lnodes,
	openValues: { lnType: firstOf(sameClassInTargetIed, firstOfClass) },
})
```

### Values

`buildIed` also writes the values the logical nodes specify, in the same transaction, after their logical nodes.

- **What is copied** — every DAS holding at least one `Val`: its `Val`s (with `sGroup`), `valKind` and `valImport`
  become those of the DAI at the same place below the built logical node (DOS → DOI, SDS → SDI, by `name` and `ix`).
  The values of an LLN0 LNode land on the logical device's LN0. A DAS without `Val`, and the mapping attributes
  (`mappedDoName`, `mappedDaName`, `mappedLnUuid`), are never written.
- **Left out, not refused** — a value whose data the logical node's type does not hold (`path-not-in-type`), or whose
  functional constraint (the `fc` of the first data attribute on its path) is in `excludeFunctionalConstraints`
  (`functional-constraint`), is listed in `plan.valuesLeftOut`; the build goes on.
- **Built again** — a value the logical node already holds as specified is not planned; one it holds otherwise is
  planned with `existing` (its DAI): its `Val`s are replaced, and a `valKind` or `valImport` the specification no
  longer gives is cleared. A DAI whose DAS no longer holds a `Val` is left as it is.
- **Paths** — a value sits on a leaf: a path ending on a sub data object or a structured attribute, array data
  without its index, or an index on data that is no array is `path-not-in-type`. A type whose id several types of
  the document carry is not read, so its values are `path-not-in-type` too.

```ts
type IedValuePlan = {
	lnode: Scl.Ref<'LNode'>
	das: Scl.Ref<'DAS'>
	path: { doi: string; sdi: { name: string; ix?: string }[]; dai: { name: string; ix?: string } }
	vals: { value: string; sGroup?: string }[]
	valKind?: string
	valImport?: string
	existing?: Scl.Ref<'DAI'>
}
// IedBuildPlan gains: values: IedValuePlan[]; valuesLeftOut: { das: Scl.Ref<'DAS'>; reason: 'path-not-in-type' | 'functional-constraint' }[]
```

### `stageIsd`

Stages the ISD of a specification built from logical nodes: in an empty document (the transaction), the logical nodes
given with their frame, reset to their specification, and the IED built from them on a copy of a shell IED. Then
[`extract.ied`](./extract#ied) from that document, with the project as `provenanceQuery`, writes the ISD.

```ts
tx.specification.stageIsd(params: StageIsdParams): Promise<StageIsdResult>

type StageIsdParams = {
  sourceQuery: Core.Query<Config>      // the project; only read
  lnodes: readonly Scl.Ref<'LNode'>[]  // the project's LNodes the staged IED implements
  shell: { query: Core.Query<Config>; ied: Scl.Ref<'IED'> } // a specification IED copied as the staged IED
  iedName: string                      // the staged IED's name: the real IED's for an instance
  iedUuid?: string                     // stamped on the staged IED: the real IED's, so an instance ISD pairs with it
  build?: Pick<BuildIedParams, 'prefixFromLeafSubFunction' | 'openValues' | 'excludeFunctionalConstraints'>
}
type StageIsdResult = {
  ied: Scl.Ref<'IED'>        // the built IED in the staging document
  build: IedBuildResult      // what the build planned and wrote
  released: Scl.Ref<'LNode'>[] // the staged LNodes a project binding was released from
}
```

Steps, in the staging document:

1. Refuse before anything is written (`SPECIFICATION_STAGE_REFUSED`, `meta: { reason, stage: 'stageIsd', ref? }`): the
   document already holds an `IED`, a `Substation`, a `Line` or a `Process` (`target-not-empty`); no LNode is given
   (`no-lnodes`); the schema refuses `iedName` as an IED name (`ied-name`); the shell IED is a real device's
   (`shell-not-specification`, the IED classification of `lifecycle.classifyIeds`); an LNode the project does not hold, or
   holds outside its substations, lines and processes (`lnode-outside-process`, one in a function template for
   instance); checked in that order, the first refusing. An LNode given twice is staged once. A shell IED the
   shell document does not hold refuses with `ELEMENT_NOT_FOUND`.
2. Start the file (an SCD header; the ISD records the project, not this document).
3. Write the process frames of the LNodes as `extract.ied` frames an IED's: the levels, equipment and functions above
   them and what describes them, with the project's names and uuids and the LNodes' types. What the export changes
   on what it writes (the cut links, the specified naming, the removed data mappings) is not applied here: a link
   to an LNode left out stays as written, and the export cuts it.
4. Release every staged LNode to its specification, before any IED is in the document: its naming back from its
   `LNodeSpecNaming`, `lnUuid` removed, `iedName` `None` (see `dataModel` `releaseLNodeBindings`).
5. Copy the shell IED with its data types, without its source files and with no lineage, named `iedName`, with
   `iedUuid` when given.
6. Build the IED from the LNodes given ([`buildIed`](#buildied)), with the project as `contextQuery` (name clashes
   judged on the project, its types offered to the `lnType` rule) and each logical device name fitting both `iedName`
   and `SPECIFICATION`, the name a template export gives the IED. The build's refusals pass through
   (`SPECIFICATION_BUILD_REFUSED`). Once built, each LNode is specified on the built IED.

No `Communication` is written. The built logical devices and logical nodes get uuids of their own: the project holds
none to keep.

```ts
const staged = await scratch.transaction((tx) =>
	tx.specification.stageIsd({
		sourceQuery: project.query,
		lnodes,
		shell: { query: shellDocument.query, ied: shellIed },
		iedName: 'P1',
		iedUuid: realIedUuid,
		build: { openValues: { lnType: firstOfClass } },
	}),
)
await isd.transaction((tx) =>
	tx.lifecycle.extract.ied({
		sourceQuery: scratch.query,
		provenanceQuery: project.query,
		iedRef: staged.ied,
		fileType: 'ISD',
		kind: 'instance',
		inputs: 'later-binding',
		issuer: 'Issuer',
		tool: 'Tool name',
		who: 'user@example.com',
	}),
)
```

## Open values

A value the standard leaves open is never invented by the engine: the caller passes a rule, a pure synchronous
function from what the verb knows about the point to a value, or `undefined` to leave it open.

```ts
type OpenValueRule<Context, Value = string> = (context: Context) => Value | undefined
type OpenValues<Points> = { [Point in keyof Points]?: OpenValueRule<Points[Point]> }

type LdInstContext = {
	container: Scl.Ref<LNodeContainerTag>
	containerName: string
	derived?: string
}
type LnTypeContext = {
	kind: 'LN' | 'LN0' | 'LPHD'
	lnClass: string
	lnode?: Scl.Ref<'LNode'> // absent for an added LN0 or LPHD
	candidates: readonly { id: string; inTargetIed: boolean }[] // that class's LNodeTypes, document order
}
```

Built-in rules: `firstOf(...rules)` (the first rule answering), `sameClassInTargetIed` (a type a logical node of the
target IED already uses), `firstOfClass` (the first type of the class); the last two also by name in
`OPEN_VALUE_RULES`, for a caller that names a rule instead of passing a function.

## Exported types

```ts
import {
	BUILD_REFUSAL_REASONS,
	VALUE_LEFT_OUT_REASONS,
	firstOf,
	firstOfClass,
	OPEN_VALUE_RULES,
	sameClassInTargetIed,
	STAGE_REFUSAL_REASONS,
	TO_IMPLEMENT_REASON,
} from '@dialecte/scl/v2019C1'

import type {
	BuildIedParams,
	BuildOpenValues,
	BuildRefusal,
	BuildRefusalReason,
	FunctionTag,
	IedValuePlan,
	IedBuildPlan,
	IedBuildResult,
	LdInstContext,
	LnTypeContext,
	OpenValueRule,
	OpenValues,
	StageIsdParams,
	StageIsdResult,
	StageRefusalReason,
	ValueLeftOut,
	ValueLeftOutReason,
	ValuePath,
	OtherImplementer,
	RoleImplementer,
	RoleLNodes,
	RoleLNodesParams,
	ToImplement,
	ToImplementParams,
	ToImplementReason,
} from '@dialecte/scl/v2019C1'
```
