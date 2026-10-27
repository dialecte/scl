---
title: Update
---

# Update

Update reconciles a project against a **newer version of a template** it was built from. The lifecycle surface exposes three explicit operations via `scenario`. **`instantiate`** places a new instance (duplicates allowed). The two **Update** modes reconcile onto an existing target instead of duplicating: **`template`** reconciles a newer _template_ onto its instance(s) (matched by `templateUuid`, lineage stamped), and **`fork`** reconciles a newer _revision of the same file_ onto the prior revision, keeping identity (matched by `uuid`, no re-stamp). With `template` and no instance yet, it falls back to the first-time instantiate.

```ts
// apply
tx.lifecycle.update.fsd(...)
tx.lifecycle.update.asd(...)
// preview (read-only) — returns a DiffReport with the fast/full classification
doc.query.lifecycle.report(...)
```

::: info Engine primitives stay internal
The `reconcile` / `diff` primitives below (in `extensions/lifecycle/engine`) are **internal** building blocks the registered verbs are built on; consumers import them directly only when composing new verbs.
:::

## Two-track surface — `report` + `apply`

The verb-agnostic surface is the recommended consumer entry point. **Dialecte decides the track**, the consumer never picks it: ask for a report, then apply.

```ts
query.lifecycle.report({ verb, scenario, sourceQuery, baseQuery?, ref, anchor, resolution? }) // -> DiffReport { target, instances, needsDecisions, summary, mappings, templateInstances, offLevel?, revisionBase? }
tx.lifecycle.apply({ verb, scenario, sourceQuery, baseQuery?, ref, anchor, report, resolution? }) // -> ApplyResult { report, instances }
```

The parameter types are exported as `LifecycleReportParams` (`LifecycleTarget & { resolution? }`), `LifecycleApplyParams` and `Resolution`; `LifecycleTarget` is a verb arm (`LifecycleVerbTarget`) and a scenario arm (`LifecycleRevisionBase`): only `scenario: 'fork'` takes `baseQuery`.

- `verb`: `'fsd'` (then `ref` is a `Function` or a `FunctionTemplate` — `FsdFunctionRef`), `'asd'` (then `ref` is an `Application`), or `'ssd'` (then `ref` is the topology scope, `Substation`/`VoltageLevel`/`Bay` — see [the note below](#tx-lifecycle-update-ssd)) — the **layer**;
- `scenario`: `'instantiate'` | `'template'` | `'fork'` — the **operation** (see below; defaults to `'template'`). `'template'` and `'fork'` are the two **Update** modes (`UpdateMode`);
- `anchor`: the target parent the instance lives under / is placed into.
- `baseQuery`: for a `fork` only, the **previous revision** of the file — the one the project was forked from. An element the project holds that the newer revision lacks is removed when the previous revision held it, and is the project's own otherwise (see [the fork](#scenario-—-instantiate-vs-template-vs-fork)). `report` and `apply` each read it once. Refused with `REVISION_BASE_OTHER_FILE` when its `Header` names another file than the newer revision's (both carry a `uuid`, and they differ); another scenario given one is refused with `REVISION_BASE_WITHOUT_FORK`.
- `resolution`: what the consumer resolved, as one object — `{ decisions?, mappings?, keepNameTypesFrom?, boundLogicalNodeTypes?, referencesByName?, afterApply? }` (type `Resolution`). `apply` reads all of it but `boundLogicalNodeTypes`; `report` reads `mappings`, `boundLogicalNodeTypes` and `referencesByName`, so the report is re-derived from the consumer's choices and shows their consequence:
  - `decisions`: accept / skip (and edited values) per decision group — see [Decision groups](#decision-groups-full-track);
  - `mappings`: where a shared element lands, per source element — see [Shared-element mappings](#shared-element-mappings);
  - `keepNameTypesFrom`: on a type-dedup name clash, which side keeps the type name — `'target'` (default, destination is the naming authority) or `'source'` (the incoming template);
  - `boundLogicalNodeTypes`: whether an `LNode` bound to an IED takes the type a newer template gives it — `'follow'` (default) or `'keep'` (`BoundLogicalNodeTypes`, see [the bound `LNode`](#decision-groups-full-track)). `apply` writes the type changes the report lists, so the report alone reads it;
  - `referencesByName`: whether a reference of the project whose uuids disagree with the template's pairs with it by the names of what both name — `'never'` (default) or `'placeholders'` (`ReferencesByName`, see [Child matching](#child-matching-—-one-shared-matcher)). `report` and `apply` read it alike;
  - `afterApply`: the consumer's own step, run once after the apply — see [below](#the-consumer-s-step-after-the-apply-—-resolution-afterapply).

**A report is applied to the target it was made for.** `report` writes what it was made for on `report.target`
(`ReportTarget`: the record ids of the project and the template documents, `verb`, `ref`, `anchor` as `{ tagName,
id }`, `scenario` — `'template'` when none was asked for — and `targetInstance` when one was). `apply` compares it
with what it is asked for and, whatever the track and before anything is written, refuses:

- a report made for another target, or carrying none, with `REPORT_TARGET_MISMATCH` (`meta: { field }`, the first
  field that differs, `'report'` when there is no target);
- a report naming an element the document no longer holds — an instance it covers (`templateInstances`), the
  element a mapping lands on, the element a mapping choice names — with `REPORT_STALE` (`meta: { element, kind:
'instance' | 'mapping' }`): the project changed since, report again.

A report applied a second time stays safe: a first placement finds its instance and writes nothing more, an update
finds nothing left to change.

**An FSD whose function is a `FunctionTemplate`.** A function template has no parent level: it is placed where the consumer starts from, whichever level that is, as a `Function` — a `SubFunction` under a function or a subfunction — and each `SubFunctionTemplate` it holds as a `SubFunction`. Every element inside it takes the namespace the schema declares for it where it now sits. The instance carries the template's lineage, and an update finds it and reconciles it like any function.

### Apply result

`apply` returns an `ApplyResult`: the effective `report` plus `instances`, the instance roots the write
produced or reconciled. A consumer acts on the roots **in the same transaction** (name, wire, select,
chain) without re-deriving them. Flat arrays are scenario-honest — `instantiate` yields one root set;
`template`/`fork` may reconcile several instances of one template; the not-decided-yet track yields empty arrays.
On the full track a matched instance whose changes are **all skipped** is left untouched, so it is
excluded from the returned roots — only instances actually reconciled are returned.

```ts
type ApplyResult = {
	report: DiffReport
	instances: AppliedInstances
}

type AppliedInstances =
	| { verb: 'fsd'; functions: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[] }
	| {
			verb: 'asd'
			applications: Scl.Ref<'Application'>[]
			functions: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[]
	  }
	| {
			verb: 'ssd'
			applications: Scl.Ref<'Application'>[]
			functions: (Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>)[]
	  }
```

Beyond the roots, `apply` **enriches the returned `report`**: it fills each `DiffNode`'s `appliedRef` —
the element that node became in the applied document. It completes the source/instance/applied triple:
an `added` node (and added companions) resolves to its freshly-created element, a `matched`/`modified`
node to its own instance element, a `removed` node to nothing. A consumer relates the report to the
result by reading the node (`node.appliedRef`) instead of re-deriving the report→document correlation
structurally — which is how a merge-review decorates a snapshot of the applied document, and why two
instances of one template never collide (each node carries its own `appliedRef`).

The report tells what the **last** apply placed. One report is often applied more than once — a
preview with everything accepted, a dry run with the decisions, the commit — so each apply first
forgets every `appliedRef` an earlier run filled: a node or a mapping the run leaves out carries none. An apply
that writes nothing (decisions still to take) forgets them too, and an apply that fails forgets those it filled
before failing: the transaction is rolled back, and the report points at nothing it wrote.

```ts
type DiffNode = {
	change: 'added' | 'removed' | 'modified' | 'unchanged' | 'target-only'
	sourceRef?: AnyRefOrRecord // template element (added / modified / unchanged)
	instanceRef?: AnyRefOrRecord // existing element (removed / modified / unchanged)
	appliedRef?: AnyRefOrRecord // what it became after apply (filled by apply; absent on a pure report)
	attributeChanges?: AttributeChange[] // what an accepted update writes (modified)
	typeChanges?: AttributeChange[] // the type references whose type an accepted update brings (modified)
	textChange?: { before: string; after: string } // the text an accepted update writes (modified)
	// what the update lists but does not apply: the project keeps `before` (a matched node, modified or not)
	keptAttributeChanges?: KeptAttributeChange[] // AttributeChange & { reason: KeptAttributeReason }
	// ...tagName, children
}
```

### Scenario — instantiate vs template vs fork

The scenarios are **distinct operations**, chosen explicitly by the consumer — dialecte does not infer one from the other (a same-version re-upload is a valid duplicate, so inference is unsafe). `template` and `fork` are the two modes of the **Update** action, distinguished by how the source relates to the target:

- **`instantiate`** — place a **new** instance of the template. Duplicates are allowed: re-applying the same template yields **another** instance (never a silent no-op), with a sibling name collision auto-resolved (e.g. `HMI` → `HMI_1`, and its composed functions `Prot` → `Prot_1`). The placed `name` is an editable field so the user can override the auto-resolved value.
- **`template`** — source is a **template**; reconcile it **onto** its existing instance(s). Elements match by `templateUuid` (= the source `uuid`); added elements are stamped with instance lineage. Names stay the project's: an instance is named where it sits, a template's rename does not reach it. If none exists yet it is the first-time case (instantiate); with existing instances it reconciles in place and never duplicates. _(Was `update`.)_
- **`fork`** — source is a newer **revision of the same file**; reconcile it onto the prior revision, **keeping identity**. Source and target share `uuid`, so elements match by `uuid` (not `templateUuid`); the reconcile updates in place with **no re-stamp and no provenance**, removes an element the previous revision held (`baseQuery`) and the newer one lacks — without `baseQuery` it keeps it, listed as the project's own (`target-only`, kept by default), and `report.revisionBase` is `'absent'`; a reference without a uuid of its own the newer revision lacks is removed either way, as part of the element holding it — and adds a newly added element **keeping its source `uuid`** (so the target converges to the source revision's identity). What a fork places keeps its `uuid` too — a function or an application the newer revision gained, a first fork into a level that lacks it — with no lineage and no `FunctionSclRef` / `ApplicationSclRef` of its own (an SSD fork lists the file in the project's `Header`, as any SSD placement); an element of the project already carrying the `uuid` is the one reconciled, where it sits, never a second copy. A renamed element takes the revision's name (listed as a `name` change), and every path naming it follows; a name a sibling of the project already holds is numbered (`Prot2` → `Prot2_1`), as on a placement, and the report lists the numbered name. The renames of one parent are all written before any is numbered, so two elements trading names keep the revision's. The single-layer form of an SCD fork — e.g. bringing an FSD/ASD template from revision _n_ to _n+1_.

`report.needsDecisions` gates the track:

- **fast** (`false`) — first-time instantiate or a conflict-free change → `apply` writes headless (pass no `decisions`): it writes what the report lists, each group at its suggested action — an element the project added is kept, a reference the report kept stays. Decisions supplied anyway are honored, user value edits included;
- **full** (`true`) — the instance exists and something changed → `apply` needs `decisions`. Without them it writes **nothing** and returns the report so the caller can drive the review; with them it applies only the accepted groups (across both layers for an ASD).

### Decision groups (full track)

`report` is a list of instances (`report.instances`), one {@link ReportInstance} per matched
instance; each instance owns its accept/skip `groups`. `allGroups(report)` flattens the
groups across every instance. The user decides on a **group**, never an individual element — each
group carries its primary change plus the companions that travel with it, so a partial, incoherent
apply is impossible. An element the project added (`target-only`) is never a companion: below a change of the template it
is a group of its own, suggested `skip`, so accepting the change never removes it.

```ts
type DecisionGroup = {
	id: string // key in the decisions map
	change: 'added' | 'removed' | 'modified' | 'target-only'
	title: string
	primary: DiffNode
	companions: DiffNode[] // read-only detail — travel with the primary, never toggled alone
	dependsOn: string[] // group ids this one requires
	suggestedAction: 'accept' | 'skip' // default when the group is absent from the decision map
	editableAttributes?: EditableAttribute[] // the attributes of `primary` a UI may edit, and how
	sideEffects?: RemovalSideEffect[] // what removing it does elsewhere: references, emptied containers (read only)
}

type RemovalSideEffect = { element: { tagName: string; id: string }; effect: 'deleted' | 'cleared' }

// derived from the schema, so the report is self-describing and the UI never re-derives them
type EditableAttribute = { attr: string; mode: 'rename' | 'free' }
```

A group that removes elements (a `removed` change, or a `target-only` one whose removal is accepted) lists in `sideEffects` what that removal does outside them, as the delete hooks and the commit then do it: each reference elsewhere in the project naming a removed element — an application's `FunctionRef` to a removed function, a `FunctionCatRef`, an input fed by a removed logical node — is `deleted`, or `cleared` when it keeps its content (`SourceRef`, `ControlRef`, `DOS` / `SDS` / `DAS`, `InputVar` / `OutputVar`, `ProcessEcho`: its uuid, path and companion attributes go); a container the removal or those deletions leave holding nothing goes too (a category without its last reference, the wrapper it leaves empty), `deleted`, with the references to it in turn. What the group removes itself is not listed. Nothing there is decided: `apply` writes it with the removal.

The attributes classified are those the element's definition declares where it sits — the type it names with `xsi:type` included — not only the tag's. Each is `identity`, `reference`, `rename` or `free` (`AttributeEditability`); only the last two are listed. Schema-derived classification also decides what is **not** editable: reference attributes (paths/uuids and type-id refs such as `lnType` and `DO`/`SDO`/`DA`/`BDA` `type`) are `reference` — system-owned, resolved internally, never surfaced as editable. On top of that, a **locked `LNode`** (bound to an IED — `iedName` set, not `'None'`) owns where it is implemented (`iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst`, and `lnUuid`, the logical node it is bound to): `reconcile` never writes them, even when a UI-instructed edit lists them, and none of them is a change to decide. Its type is not implementation: the type of an `LNode` is what it was specified with, its implementation does not change it, so a template changing the type of a bound `LNode` changes it as for any other — listed in `typeChanges`, decided with its group (see the type below). A consumer keeping the type of bound `LNode`s asks the report for it (`resolution.boundLogicalNodeTypes: 'keep'`): the change is then listed on the node's `keptAttributeChanges` as `{ name: 'lnType', before, after, reason: 'bound-logical-node' }` and not applied. A kept change opens no decision: an instance whose only difference it is stays `upToDate`, and `report.summary.kept` counts it. Its implementation differs from the template by design and is never listed. What the template specifies for it is compared with its `LNodeSpecNaming` and written there: a template now specifying `XCBR3` changes `sLnInst`, the `LNode` stays bound where it is. A `fork` keeps the binding made in the project too, even when the newer revision binds the `LNode` elsewhere. The binding is the lock (`dataModel.isLNodeLocked`); a binding to a logical node the document does not hold is released by `apply` for what it places (see [below](#lnodes-placed-bound-to-a-device-the-project-lacks)) and by the extract clean-up.

**A logical node's type is compared by what it holds.** `lnType` names a type of the element's own document: a template and a project may hold the same type under two ids (the project reused an equal type it held when the template was placed), or two types under one id (two library files written apart). So it is never compared or written as a value: the type each side names is read in its own document and compared by its content (`signature.elementSignature`, ids left out, the types it names folded in). An equal type under another id is no change; a type the template changed under the same id (a data object gained, a data attribute changed, an enumeration value) is one, listed on the element's node as `typeChanges: [{ name: 'lnType', before, after }]` — `before` the id the instance names, `after` the id the template names, which may be equal — and decided with the element's group like an attribute change. Accepted, `apply` brings the template's type through its closure (`dataModel.importTypes` with the element as a follower): an equal type the project holds is reused, a free id kept, a taken one forked, and the element is pointed at the id that resolves to — never at the template's id as it is. The type the element leaves is removed once nothing else names it, and a fork then takes the freed id back: a type only this template's instances name is updated in place, under its id; one anything else names — an instance of another template, an element of the project, a logical node of an IED, an instance whose group is skipped — is left as it is, and the instance moves to a fork. Several instances updated in one apply end on one type. A template naming no type any more clears the element's; a template naming a type its own file lacks brings nothing. `apply` writes the type changes the report lists in the groups it accepts; the update verb called on its own (no report) writes every one.

An instance of a template also keeps what it configures where it sits — a `BehaviorDescription`'s `fileReference` (the file describing the instance's behaviour) and a `Variable`'s `value` (set for the instance, or by the variant it selected): a template update never writes them, and a template changing one is listed on the node's `keptAttributeChanges` with `reason: 'instance-configuration'` — no decision, the instance stays `upToDate`. A `fork` writes them, as it writes the revision's names; an element the update adds carries the template's.

`apply` takes `resolution.decisions: Map<groupId, GroupDecision>` where a decision is either a plain
accept/skip or an object carrying **edited values** for the group's `editableAttributes`:

```ts
type GroupDecision =
	'accept' | 'skip' | { action: 'accept' | 'skip'; values?: Record<string, string> }
```

A group absent from the map defaults to its `suggestedAction` — `accept` for most changes (so an
empty map applies everything), but `skip` for a `target-only` group, so an author-added element is
kept unless the user explicitly opts into removing it. The engine rejects a set that accepts a group
whose `dependsOn` parent is skipped, and, before anything is written, a decision for a group the report does not
list (`DECISION_UNKNOWN`: decisions taken on another report) and a report whose group depends on a group it does not
list (`DECISION_DEPENDENCY_UNKNOWN`).

**An addition that cannot be written is listed.** An element the template adds that collides with one the instance
holds where it lands, on a key none of whose fields can be changed (an `LNode` sharing class, instance, prefix,
device and IED with an `LNode` the project added), carries it on its node:

```ts
type IdentityCollision = {
	constraint: string
	fields: string[]
	collidesWith: { tagName: string; id: string }
}
// DiffNode.identityCollision?: IdentityCollision
```

The report then needs decisions (`needsDecisions: true`): its group can be skipped, or accepted together with the
removal of `collidesWith` (the project's own element, a `target-only` group suggested `skip`). Accepting it while
`collidesWith` stays is refused by `apply` with `IDENTITY_COLLISION` before anything is written (see
[Placement collision resolution](#placement-collision-resolution)).

What a placement writes, the report says goes with it (`dependsOn`), on a first placement and for
what an update places afresh:

- **a level takes what it holds with it** — a group placing an element inside an element another
  group adds (a function in a bay the placement creates) depends on that group;
- **a reference goes with what it points at** — a group adding a reference to an element another
  group places (an application referring to the functions it composes) depends on that group.

Every leave-out is honoured: leave out a bay with what it holds and nothing of it is written — not
even the provenance when nothing at all is left; leave out a function and the bay is placed without
it; leave out an application and the functions it composes are placed without it. Leaving out a level
or a function while keeping what depends on it is refused before anything is written. A consumer that
leaves out a group leaves out what depends on it in the same move — the decisions it passes to
`apply` are then the ones the preview shows.

### Shared-element mappings

Some elements are held once by the project and shared — an `AllocationRole` several applications refer to, a `FunctionCategory` classifying several functions. A template that brings such an element does not necessarily copy it: it **maps** it onto an element of the project, or creates a new one. `report` lists that decision for every shared element the template brings, and the consumer may change it.

```ts
type ReportMapping = {
	id: string // the key of a choice made for it: the record id of the SOURCE element, or `<placedFor id>::<source id>`
	sourceId?: string // record id of the source element, when `id` is scoped to `placedFor`
	placedFor?: AnyRefOrRecord // the project element this mapping is decided for, when listed once per such element
	tagName: string
	kind: MappingKind // 'level' | 'shared': a structural level of the template, or a shared element
	mapping?: DecisionMapping // where it lands, as resolved — absent: the consumer has to choose
	projectOwned?: true // it lands on an element the project owns (reused, not an instance of the source element)
	parentPath?: string // for an element to create: the path of the element it is created under
	reason: MappingReason // 'decision' | 'lineage' | 'name' | 'anchor' | 'only' | 'none'
	ambiguous: boolean // something qualified and nothing was picked
	selectable: boolean // the consumer may choose another mapping: `true` for every mapping listed
	locked: boolean // the instance being updated already carries this mapping: shown, not changeable
	candidates: MappingCandidate[]
	dependsOn?: string // the mapping this one follows from (the level above)
	appliedRef?: AnyRefOrRecord // filled by `apply`: the element it became, or was mapped onto
}

type MappingCandidate = { ref: Scl.Ref<Scl.ElementsOf>; title: string; path: string }

type DecisionMapping = { existing: Scl.Ref<Scl.ElementsOf> } | { create: { name?: string } }
type DecisionMappings = ReadonlyMap<string, DecisionMapping> // keyed by `ReportMapping.id`
```

`ReportMapping`, `MappingKind`, `MappingReason`, `MappingCandidate`, `DecisionMapping` and `DecisionMappings` are exported from `@dialecte/scl/v2019C1`.

- **Resolved by default**, first answer wins: the one project element created from this source element by an earlier placement, whatever it is named now (`reason: 'lineage'`); else the project element of the same name when there is exactly one (`'name'`); else a new element (`'none'`). Where several elements qualify equally, none is picked (`ambiguous: true`): the mapping is left **undecided** — `mapping` is absent, the report sets `needsDecisions`, and `apply` refuses (`MAPPING_UNDECIDED`, before anything is written) until the consumer passed a choice, an existing element or `{ create: {} }` — for a level, a choice for a level above it it follows from is enough; a mapping decided for one instance (`placedFor`) whose every change is skipped is not asked for.
- **`candidates`**: every project element of that tag, listed from the placement outwards — the anchor's own level, each level above it, then the rest of the project. For an SSD, the anchor is where its unit lands (the deepest level of the project it sits on), not the element the consumer started from. For a `locked` mapping, the one element it is mapped onto.
- **A new element** carries the name asked for: the one the consumer chose, else the source name. The report does not predict the name written: `apply` makes it free where the element lands ([placement collision resolution](#placement-collision-resolution)), and the consumer's own step may change it again. What was written is read at the element the mapping leads to once applied (`appliedRef`, on the report `apply` returns — in a preview, on the prepared document). `parentPath` tells where the element is created, as asked for.

To change a mapping, pass the choice and ask for the report again; then apply with the same `resolution`:

```ts
const decisionMappings = new Map([[roleMapping.id, { existing: roleMapping.candidates[0].ref }]])
const report = await doc.query.lifecycle.report({
	...target,
	resolution: { mappings: decisionMappings },
})
// report.mappings and the review tree now show the role matched onto that element
await doc.prepare((tx) =>
	tx.lifecycle.apply({
		...target,
		report,
		resolution: { decisions, mappings: decisionMappings },
	}),
)
```

A `Variable` or a `BehaviorDescription` is not shared: it belongs to the instance it configures. Each placement clones its own at the template's level — never mapped onto, never merged into, an element of its name the project holds — and numbered when its name is taken there (`VXCBR_1`), as any placed element. It is not listed in `report.mappings`: where it lands is not the consumer's to choose. An update reads each instance's own one: the one created from the template's for that instance, else the one an earlier placement gave the instance's references to — never one of another instance. A document where an earlier version made one variable for several instances is read as it is: each instance compares its own references with the template's, nothing else is listed, nothing is split.

A choice the report cannot honour is refused, by `report` and by `apply`: a source element the report does not list (a variable or a behaviour description among them), a project element that is not among the candidates, or a mapping that is `locked`.

The element a source element is mapped onto stays the project's: its own attributes are neither compared nor written, it receives no `templateUuid`, and only what the source contributes below it (an `AllocationRole`'s function references, a `FunctionCategory`'s classifications) is added. The references to it follow (`AllocationRoleRef`, `FunctionCategoryRef`: uuid and path).

Inside such an element, a named container the source brings (a `SubCategory`) lands on the container the project element already has: the one created from it by an earlier placement, else the one of the same name — which is the project's too, so its attributes are left alone. A container with no counterpart is added. What the project element holds besides is neither announced nor touched.

Mappings are resolved for every verb — a function's categories (`verb: 'fsd'`, and the functions an application composes or an SSD carries), an application's roles (`verb: 'asd'`, or carried by an SSD) — on a first placement and on every update.

#### On an update

An update finds, for each instance, the project element that instance already holds for a shared source element, and keeps it: the mapping is listed with `reason: 'lineage'` and `locked: true`. Nothing is written in the file to remember a mapping; it is read from what the placement wrote, strongest evidence first:

1. the element was created from the source element (it carries its lineage) — it is an instance of it, reconciled in full, attributes included;
2. the element holds a reference to the project element standing for one the source element refers to (the function references a mapped `AllocationRole` was given) — so a role the project's author renamed since is still found;
3. the element has the same name;
4. it is the only element the instance holds, for the only shared element the template brings.

A step pairs a source element with a project element only when neither has another possibility. An element found by 2–4 is the project's own: only what the source contributes below it is added, reconciled or removed; its own attributes and its other children are left alone, and it is never deleted by an update.

When the template drops a shared element altogether, the project element it was mapped onto stays too — the update does not remove it, though a project variable or behaviour description left applying to nothing goes at the commit, as every container left holding nothing, the group's `sideEffects` listing it. What the instance had given it — its references pointing at an element of that instance — is announced as removed and removed when accepted; the references it holds for the project or for other instances are not touched. A shared element the placement created (it carries the template's lineage) is removed as a whole: with the change of the element it belongs to, or as a decision of its own when that element is unchanged — unless something outside the instance updated still names it or is named by it (a category classifying another instance's function or a function of the project, a role another application refers to): it then stays, and only the references the instance gave it are announced as removed and removed when accepted. `report` and `apply` read this one answer; with two instances updated in one apply, the second one's references follow the report, and a shared element left holding nothing goes at the commit.

A shared element the template brings that the instance holds nothing for (a role added by a newer template version) is resolved as on a first placement, and the consumer may choose. When the instance does hold elements that could stand for it but nothing tells which — two mapped roles with no function reference, both renamed since — none is guessed: the mapping is left undecided with `ambiguous: true` and `reason: 'none'`, and nothing is written until the consumer maps it (the instance keeps what it holds).

Both `report` and `apply` read this one answer, so an update no longer creates a second element beside the one the instantiate mapped.

With several instances of one template, each instance has its own `mappings`. `report.mappings` lists each shared source element once: the mapping still to decide when an instance has yet to be given one (a choice reaches every such instance), else the mapping the instances carry.

### Where a template lands — the levels are mappings too

The structural levels of a template (`Substation`, `VoltageLevel`, `Bay`) are listed in `report.mappings` with `kind: 'level'`, first and top-down, each with `dependsOn` (the level above) and, as `candidates`, the elements of the project below the one the level above lands on. The element the consumer starts from (`anchor`) is a suggestion, not the answer:

- a level the anchor's own chain holds lands there (`reason: 'anchor'`);
- else the only such level below the one above (`'only'`);
- else, with several, **none is picked**: `mapping` is absent, `needsDecisions` is set and `apply` refuses until the consumer chose — a level that follows from an undecided one is undecided too;
- else it is created: under the name the consumer asked for, else its own, a level named `TEMPLATE` being named after its kind — `apply` makes it free where it lands — with `parentPath` the path it is created under, as asked for, whether that parent exists in the project or is created by the same placement. The name written is read at the mapping's `appliedRef`.

A level the template names (the unit to instantiate and what is below it) is created unless the consumer maps it onto a level of the project, which then receives the content it lacks and keeps what it holds (`projectOwned: true`). Changing where a level lands changes the candidates of the levels below it.

On an update, each instance lists the levels it already sits on (`locked`). A level the template **gained** since the instance was placed (a bay added to a voltage level typical) is listed for that instance as a choice: `id` scoped to the instance (`<instance id>::<source level id>`), `sourceId` the level, `placedFor` the level of the project the instance sits on, `mapping` `{ create: { name } }` by default (`reason: 'none'`), created under the level the instance holds above it, its name made free there. Its `candidates` are the levels of that kind the project holds there that the instance does not stand on: mapped onto one (`{ existing }` under that `id` in `resolution.mappings`), the gained level's content lands in it — what it holds is left as it is, it is not renamed and gets no lineage; `{ create: { name } }` names the new one (a value edited in the review has the last word). The report and the update read the same answer.

This holds for an SSD, and for an FSD or an ASD started **above** the level its function or application was made for: the template's levels are then listed and resolved the same way, the content lands on the level they say, and the report carries `offLevel: { templateLevel, startedFrom }`. Started at that level or below, nothing is listed and the content lands where the consumer started.

On an update the levels an instance already stands on are listed `locked`, each on the level it was created from or mapped onto.

### Multiple instances of one template

Several instances of one template may live under one anchor (each with a unique instance `uuid`,
sharing one `templateUuid`). `report` enumerates **every** instance and returns one
{@link ReportInstance} per instance in `report.instances`, each carrying its own `groups` and
`title`. There is **one** report holding all instances.

`report.instances` also lists what an instance holds that is reported on its own (the functions an
application composes, the primaries a placed unit holds). `report.templateInstances` lists only the
instances of the template itself that the report covers — what an update reaches: the applications
of an ASD, the functions of an FSD, the placed units of an SSD. It is empty on a first placement.

The decision map is the selector: accept the groups of the instances you want and skip the rest to
update a **subset** (e.g. 2 of 4). `apply` reconciles each instance independently, gated by only its
own groups. A UI iterates `report.instances`, labels each section with the instance `title`, and keys
the `decisions` map by `group.id` (already scoped per instance, so globally unique).

#### What the instances share

Instances of one template may share an element — an `AllocationRole`, a `FunctionCategory`, or a
`Variable` an earlier version made once for several instances — each giving it its **own** reference children (one `FunctionRef` per instance, each to
that instance's function). `report` and `apply` compare each instance with its own references only:
a reference to an element another instance holds is that instance's, never the counterpart of one
of this instance's. So when the shared element of the template gains a reference, every instance
contributes its own — the report lists it as added for each instance, and `apply` adds one per
instance, each pointing at the element of that instance.

#### What the template gains, with several instances

A function or an application the template **gains** has no instance yet: `apply` places one for each
instance of the template — a function an application gained in the bay of each instance of the
application, a primary a substation template gained in each instance of the unit. The report lists
it the same way: one first-time instance **per placement**, each with `placedFor` — the instance it
is placed for: the instance of the application, or the level the instance of the unit sits on (not
the level it lands in, which the update may be creating: `placedFor` names the same element before
and after the write) — and its own groups (their ids are scoped to it). A primary in a level the
template gained depends, in each instance, on the group adding that level there: leave the bay out
in one instance and what it holds is left out there only. The groups of the instance that refer to it (the application's new reference) list
that placement in `dependsOn`: skipping the placement while accepting the reference is refused, so a
reference never points at nothing — skip both to leave that instance as it was. Placed once only
(one instance), a first-time instance carries no `placedFor`.

Where an instance lives, a function of that lineage may already stand on its own (belonging to no
instance): that one is taken for the instance, reconciled where it sits, and listed as such. When
several qualify, nothing tells which one: `report.mappings` lists the choice for that instance — `id`
scoped to it (`<application instance id>::<source function id>`), `sourceId` the source function,
`placedFor` the application instance, `candidates` the functions that qualify — without a `mapping`,
`needsDecisions` is set and `apply` refuses until the consumer passes `{ existing }` (one of them)
or `{ create: {} }` (a new one, placed for that instance) under that `id` in `resolution.mappings`.
The report and the update read one same answer for each function, per instance.

A function or an application placed as part of a larger template carries that template's provenance,
not its own: a function an application gains gets no `FunctionSclRef`, a primary a substation
template gains no `FunctionSclRef` / `ApplicationSclRef`.

#### Provenance after an update

An instance records the revision of the file it holds. After a template update, the instance's own
`FunctionSclRef` (`update.fsd`) or `ApplicationSclRef` (`update.asd`) names the newer file version —
its `SclFileReference` is brought to the source `Header`'s `version` and `revision` in place, one
reference per file (the references it records of other files are left). It is not rewritten when
every change the update brings to that instance is declined (for an application, to the functions it
composes and to the functions placed for it too); an instance the newer revision changes nothing for records it all the same. A function
or an application updated as part of a larger template keeps the references it holds (a function of an application keeps the `FunctionSclRef` of its FSD).
An SSD update — template or fork — appends the newer revision to the project's `Header > SourceFiles`
after the ones listed, unless that file version is listed already. A fork records no file on an element.

### Functional variants an instance selected

An application template may describe several variants of itself (`FunctionalVariant`s, grouped in
`FunctionalVariantGroup`s, refined by `FunctionalSubVariant`s); an element of the application marks, with a
`FunctionalVariantRef` (`update: 'add' | 'remove'`), the variants that add or remove it. A specification tool selects
one variant of each set when it instantiates the application, and keeps only what that selection leaves: the variants
not selected are gone, the markers too, and so are the elements the selection removed, the subfunctions only those
composed and the references naming them.

An update reads the selection from what the instance holds. A set of exclusive variants (an application's variants, a
group's, a variant's sub-variants) is selected when the template holds several and the instance one of them (matched
by its lineage, else its name): the instance is then compared with the template **as that selection reads it** — what
the selection leaves out is neither listed nor written, at any depth:

- the variants not selected, and the sub-variants of a variant not selected;
- every marker naming a variant of a selected set (the selection consumed it), also inside an element the update adds;
- every element the selected set excludes: one of its markers of the set removes it with the variant selected, or its
  markers of the set adding it all name variants not selected;
- every function or subfunction those elements compose (`FunctionRef`) that no element kept composes — neither it
  nor anything below it (the function the application is rooted on always is);
- every reference of the template naming, by its uuid, an element inside what is left out (a `ProcessResourceRef`, a
  `FunctionCatRef`, a `SourceRef`, an `LNodeInputRef` naming that `SourceRef`…).

A change of the template inside what the selection keeps reaches the instance as any. An element the selection would
leave out that the instance does hold is compared as any: what the project kept stands. The report lists, on the
application's instance, the template's variants not selected (`variantsNotSelected`) — a variant the template gained
since included: it is not added, and opens no decision (choosing another variant is the selection, not an update). An
instance holding several variants of a set has not selected yet (an SSD template may keep its variants for the
project to choose): nothing changes for it. A function several instances of the application compose leaves out only
what none of their selections uses; a variable, a category or a role the template holds beside the application is not
placed when it reaches it only through what the selection leaves out. A fork reads no selection: the variants of a revision of the same file are its
content.

### Placement collision resolution

When a group is accepted and its primary is **placed** (a first-time instantiate, a composed function,
or a add onto an existing instance), the engine validates it against its parent context and
auto-resolves a scoped-uniqueness collision (e.g. two children with the same `name` under one Bay →
`Prot` becomes `Prot_1`).

A collision on a key none of whose fields can be changed — an `LNode` sharing its class, instance, prefix, device
and IED with another `LNode` of the same function — cannot be told apart by numbering, and the engine never deletes
one to create the other: the apply is **refused** with `IDENTITY_COLLISION` (`meta: { constraint, fields, element,
collidesWith }`), nothing written. An update reads it once the removals of the same apply are written: a template
that drops an `LNode` and adds another of the same key, or the project's own `LNode` whose removal is accepted with
the addition, is no collision. A rename never causes one (it changes editable fields only).

The engine always **owns uniqueness**, in one format: a taken value is numbered `<value>_1`, `<value>_2`, …,
and a value that already ends with a number gets the next free one instead of a second number (`Prot_1`
taken → `Prot_2`, never `Prot_1_1`). A `values` override lets the user set an editable field (typically
`name`): the user's value is applied first, then uniqueness is re-ensured — a user name that itself
collides is still numbered. Only attributes listed in the group's `editableAttributes` are honoured.

Which values must be unique is read from the uniqueness rules of the schema (the identity constraints of
the parent's definition, read with `query.getDefinition`), as the schema writes them:

- the rules are those of the place the element sits — one tag can carry different rules under different
  parents (an equipment of a sub-function compares the names of its sub-equipments only, an equipment of
  a bay those of its sub-equipments and functions together);
- a rule that selects children directly under the element it is declared on (a selector of one step,
  not `.//`) is the one a placement renames for; a longer selector selects deeper elements only;
- a rule that reaches the whole document (`.//`, such as the uuid uniqueness on `SCL`) is left to
  validation: a placement does not rename for it;
- the compared children are those the selector's name and namespace admit: a rule that selects elements
  of another namespace than the children it is meant for selects nothing. The `LNode` rule of a
  `SubFunctionTemplate` names SCL `LNode`s while a template holds `LNode`s of its own namespace, so the
  logical nodes of a template are not renumbered;
- a value is compared only on the children carrying every field the rule reads: a child missing one of
  them is not compared.

### LNodes placed bound to a device the project lacks

An `LNode` bound to an IED names the logical node (`LN` / `LN0`) that implements it, and that logical node must be in the document. A template keeps the bindings it had: once everything is written, and before the consumer's step, `apply` looks at the implementation the run **wrote**: every `LNode`, `DOS` / `SDS` / `DAS` and `SourceRef` / `ControlRef` it created (in a level it created too), and those it updated on their binding or on a reference (a binding it copied onto an `LNode` the project held). One it only touched otherwise, a child added under it for instance, is not looked at. What names nothing in the project is released (`cleanUp.resetLNode` on those elements, see [Clean-up](./clean-up#resetlnode)):

- bound to a logical node the project does not hold → assigned to no IED (`iedName="None"`, `lnUuid` removed, `ldInst` / `prefix` / `lnClass` / `lnInst` from its `LNodeSpecNaming`, which keeps its values; without one, `ldInst` is removed and the rest kept). With an `lnUuid`, only the logical node of that uuid counts, whatever its naming says;
- its `DOS` / `SDS` / `DAS` mapped to a logical node, or its `SourceRef` / `ControlRef` naming an `ExtRef` / `ExtCtrl`, the project does not hold → that name is removed, the element stays.

A `fork` of the same file whose project holds the logical node keeps the binding. What the run did not write is left as it is, even when it names nothing. The verbs called directly (`tx.lifecycle.instantiate.*`, `tx.lifecycle.update.*`) do not do it: they are steps of `apply`.

### The consumer's step after the apply — `resolution.afterApply`

A consumer that names what it places its own way, or wires it to something the template does not know,
does it in its own step, passed with what it resolved:

```ts
async function afterApply(tx: Scl.Transaction, { instances }: { instances: AppliedInstances }) {
	for (const application of instances.verb === 'fsd' ? [] : instances.applications) {
		const name = await tx.getAttribute(application, { name: 'name' })
		await tx.update(application, { attributes: { name: `${name}_App` } })
		await tx.lifecycle.makeUnique({ ref: application })
	}
}

await doc.prepare((tx) =>
	tx.lifecycle.apply({ ...target, report, resolution: { decisions, afterApply } }),
)
```

- It runs **once**, after the whole apply, in the **same transaction**: what it writes is previewed
  (`doc.prepare`) and committed with the rest, and a consumer calling `apply` without a review gets it too.
  It receives the instances the apply placed or reconciled — only those it wrote. It does not run when
  nothing is written (decisions still to take).
- The engine knows nothing of what the step does. To tell a name apart from a taken one, the step calls
  **`tx.lifecycle.makeUnique({ ref })`** (`MakeUniqueParams`): the element is made unique where it sits in
  the engine's format, and the outcome is returned as data (`PlacementResolution`) — `{ status: 'ok' }`,
  `{ status: 'resolved', attr, from, to }`, or `{ status: 'unresolvable', violation }` when the key has no
  field that can be changed; the `violation` (`ConstraintViolation`) names the `constraint`, its `fields`
  and the `offendingId` of the sibling collided with.
- The step's type is exported as `AfterApplyHook`: `(tx: Scl.Transaction, { instances }: { instances: AppliedInstances }) => Promise<void>`.
- After the step, what it wrote is held to the uniqueness rules of where each element sits, as the engine's own
  writes are: an element it created, or whose key it changed (a bay it renamed, outside what the apply placed as
  well as inside), that shares a key with a sibling is numbered on the key's editable field — a name the step gives
  that is taken there is numbered all the same — and refused with `IDENTITY_COLLISION` when nothing in the key can be
  changed (two `LNode`s of one class, instance, prefix, device and IED). A collision the project held before, on a
  key the step did not touch, is left as it is.

#### The names written are read from the outcome

`report` says what is asked for, not what will be written: a name taken where an element lands is made
free by `apply`, and the consumer's own step may rename it after that. A consumer showing the final
names previews the apply (`doc.prepare`) and reads them at the elements the report leads to — a node's
or a mapping's `appliedRef`. The group's `editableAttributes` only say what the user may edit:

```ts
type EditableAttribute = {
	attr: string
	mode: 'rename' | 'free'
}
```

Wrap `apply` in `doc.prepare(...)` for a previewable, reversible dry-run:

```ts
const target = {
	verb: 'fsd',
	scenario: 'instantiate', // or 'template' | 'fork'
	sourceQuery: template.query,
	ref: { tagName: 'Function', id: 'fn-1' },
	anchor: { tagName: 'Bay', id: 'bay-1' },
} as const

const report = await doc.query.lifecycle.report(target)

const decisions = new Map<string, GroupDecision>()
if (report.needsDecisions) {
	// iterate report.instances and render each instance's groups (+ each group's
	// editableAttributes) — or allGroups(report) to flatten — collect the user's
	// accept/skip choices, and any edited values, into `decisions`
}

const prepared = await doc.prepare((tx) =>
	tx.lifecycle.apply({ ...target, report, resolution: { decisions } }),
)
await prepared.commit() // or prepared.discard()
```

### Presentation scope

`presentationScope(target)` is a small, layer-derived descriptor a UI can use to render the merge as a **structural tree**: where to root it, which top-level SCL sections are irrelevant to the layer, and which to include alongside the rooted subtree. For `fsd` / `asd` / `ssd` it roots at `Substation`, includes `DataTypeTemplates` (a sibling of `Substation` that the layer references), and omits `Communication` and `IED` (the IED layer will bring `IED` back into scope).

```ts
import { presentationScope } from '@dialecte/scl/v2019C1'

const { rootTag, omit, include } = presentationScope(target)
// { rootTag: 'Substation', omit: ['Communication', 'IED'], include: ['DataTypeTemplates'] }
```

## `tx.lifecycle.update.fsd`

Access via `tx.lifecycle.update` inside a `doc.transaction()` callback.

`fsd({ sourceQuery, functionRef, targetParent })` reconciles a project against a (possibly newer) FSD:

- if the target already holds an instance of this Function (an element under `targetParent` whose `templateUuid` equals the source Function's `uuid`, carrying the tag the placement writes: a `SubFunction` under a function or a subfunction, else a `Function`), reconcile the updated template onto it;
- otherwise instantiate it fresh (via [`instantiate.fsd`](./instantiate#fsd)).

This unifies instantiate and update — instantiation is the first-time case of update. The read-only counterpart `doc.query.lifecycle.report({ verb: 'fsd', sourceQuery, ref: functionRef, anchor: targetParent })` returns a `DiffReport` (see [Engine](#engine)) without mutating.

## `tx.lifecycle.update.asd`

`asd({ sourceQuery, applicationRef, targetParent })` reconciles a project against a (possibly newer) ASD — the same engine one layer up, proving `engine.reconcile` is layer-agnostic. It runs two layers in order:

1. **application layer** — reconcile the `Application` subtree (roles, allocation refs, attributes);
2. **function-layer cascade** — _verbs compose verbs_: treat every composed Function the ASD references as an FSD to update and delegate to `tx.lifecycle.update.fsd`, **per instance of the application**:
   - the functions an instance refers to are its own: each is reconciled where it sits, whichever bay that is — not only those under the ASD anchor;
   - a function **added** by the newer ASD is new to every instance: each instance the update writes to gets its own, on the level that instance lives on (the bay of its other functions), and its new references point at it. A function of that lineage already standing there on its own, belonging to no instance, is taken instead of a new one; with several, the consumer chooses (see above);
   - a function that belongs to no instance is reconciled when it sits where the consumer started;
   - a function an instance composes that the newer ASD **no longer composes** is removed with the reference to it: the report lists its removal as a group of its own that depends on the group removing the reference. It is kept, and not listed, while another application of the project still composes it (functions may be shared by several applications), and when it records a function file of its own (placed from that file, not as part of the application). In a fork, the previous revision decides as for any element (`baseQuery`).

The read-only counterpart is `doc.query.lifecycle.report({ verb: 'asd', sourceQuery, ref: applicationRef })`.

> Cascade principle: an update layer = reconcile its own subtree **+** for each referenced child-layer root, delegate to that child layer's update verb with the child's own resolved structural parent. `update.ssd` below applies it one layer up.

## `tx.lifecycle.update.ssd`

`ssd({ sourceQuery, scopeRef?, targetParent, scenario, baseQuery?, report, decisions, keepNameTypesFrom })` reconciles a project against a (possibly newer) SSD — the topology layer, cascading down to `asd`/`fsd`:

- **first-time** — the project holds no instance of the scope yet — no level the scope was placed on, and no instance of a scope primary (any `Application` or standalone `Function` under the scope) — or `scenario: 'instantiate'` — delegates whole to [`instantiate.ssd`](./instantiate#ssd), so the source is recorded **once** at document level, exactly like the direct verb (not scattered per primary);
- **reconcile** — an instance exists:
  1. **topology frame** — reconcile the scope's **own** structural content (`Substation`/`VoltageLevel`/`Bay` attributes, `BayType`, equipment) via `reconcileTopologyFrame`, matched to the instance by its stamped `templateUuid` lineage — rename-robust, so a renamed Bay still matches. The fn/app tags are a **boundary** here, excluded from this pass and left to the cascade below;
  2. **application cascade** — each `Application` under the scope, via [`update.asd`](#tx-lifecycle-update-asd) (which itself cascades to its composed Functions);
  3. **function cascade** — each standalone `Function` (not composed by any `Application`), via [`update.fsd`](#tx-lifecycle-update-fsd).

A part added by the newer SSD is instantiated; an existing one is reconciled — never blindly re-added. An application or a function on a level of the unit that the newer SSD **dropped** is removed — the update replaces the unit's applications with the newer ones: the report lists each removal as a group of its own, scoped to the level's instance. A function's removal depends on the removal of the dropped applications composing it. Only what sits on the unit's own levels counts: a level placed there by another template (a bay-typical in a voltage level) or a level of the project the unit was mapped onto keeps what it holds. A level of the instance the newer SSD does not hold — one it dropped, or one another template placed there — is listed as the project's own (`target-only`), kept unless its removal is accepted. A function another application of the project still composes is kept and not listed, as is an element recording a file of its own (an ASD or FSD placed there on its own). In a fork, the previous revision decides (`baseQuery`): without it they are listed as the project's own and kept. An SSD with no application or function (levels and equipment only) is updated like any: the level it was placed on is its instance.

The read-only counterpart is `doc.query.lifecycle.report({ verb: 'ssd', sourceQuery, ref, anchor: targetParent })`, assembled the same way: the topology frame's own diff plus the union of the per-primary `reportAsd`/`reportFsd` reports, merged into one `DiffReport` so the groups of `report.instances` cover the whole scope and the fast/full classification holds across it.

::: info `ref` is the acted-upon scope
For `verb: 'ssd'`, `report`/`apply` act on the element `ref` names (same resolution as [`instantiate.ssd`](./instantiate#ssd)): a named `Substation`, `VoltageLevel` or `Bay` is the scope — a template holding several independent bays is placed one chosen bay at a time. The `TEMPLATE` scaffolding is resolved only when `ref` names it: it is walked down `Substation → VoltageLevel → Bay` to the first level holding a named element. Units of that level joined by a reference — a terminal of one on a connectivity node of the other, an input of one fed by the other, any reference the registries know — are **one element**: they are placed and updated together, rooted at the `TEMPLATE` scaffolding holding them, which lands (as a level above a unit does) on the project's level of its kind, each of their levels where its level mapping says (the Map step); a `ref` naming one of them selects the whole group, and the report lists them in `scopeUnits`. Several elements at that level: the report is refused with `SSD_SCOPE_AMBIGUOUS` (`SCL2003`), `meta.candidates` listing one per element (`{ tagName, id, name, linked }`: a unit, with the units linked to it) — a consumer offers them to choose from and asks again with the chosen one as `ref`; the units the chosen element does not hold are left out of it, on placement and on update. A `ref` the template does not hold is refused with `TEMPLATE_ROOT_NOT_FOUND`.
:::

## Satellites

A **satellite** is an element that lives **outside** the transplanted subtree but is linked to it by a UUID reference, so it must travel with it across every verb (extract, instantiate, update, report, apply). The verbs carry satellites automatically — there is no separate API to call.

### Two kinds

- **Layer-specific** — found by a layer-owned reference edge:
  - `FunctionCategory` (function layer) — a classification that **references into** the function via `FunctionCatRef.functionUuid` (reverse ref); lives at Substation / VoltageLevel / Bay level.
  - `AllocationRole` (application layer) — an IED role the application **references out** to via `AllocationRoleRef.allocationRoleUuid`.
- **Cross-cutting** — apply to **any** element in **any** subtree, found generically for every layer primary:
  - `Variable` — sets attributes/values on the elements its `VariableApplyTo.elementUuid` points at. A Variable may target **any** SCL element, so discovery is not limited to a fixed element set.
  - `BehaviorDescription` — documents the behaviour of the `LNode`s its `InputVar` / `OutputVar.lnodeUuid` reference.

  A cross-cutting satellite that lives **inside** the subtree is carried by the normal clone/diff; only external ones are handled as satellites.

A satellite's references name only what the operation places or the instance holds — its **scope**: the function and what it holds, the application and the functions it composes, the unit of an SSD, but what the consumer or the instance's selection of variants leaves out. A reference of the template's satellite naming an element outside that scope (a category also classifying a function the operation does not place, a role allocating a function of another application, a variable applying to another function) is neither listed nor written, by `report`, `apply` and the instantiate verbs alike: it would name nothing in the project, or what another placement placed. A reference of that kind the instance already holds is compared as any.

### On `report` — companions, never independent

Each satellite's change folds into the **primary's** decision group as a read-only companion. Satellites are never independently decidable: accepting a group applies the primary **and** its satellites atomically; skipping applies neither. You cannot accept one side of a tightly-linked pair and leave the other broken.

The companion preserves the satellite's **structure**: when a change is nested inside a container that already exists in the target (e.g. a new reference added into an existing `FunctionCategory` / `SubCategory`), the existing container rides as the companion — anchored to its instance — carrying the added element **in place**, so a consumer can show and couple the addition against the real container rather than as a detached node.

A satellite whose only differences are changes the update keeps (a behaviour description's file, a variable's value: [kept changes](#decision-groups-full-track)) opens no decision: its node is listed in the primary's `tree`, with its `keptAttributeChanges`, and counted in `report.summary.kept`.

::: info A first placement contributes its own references
A shared satellite container (a category, a role) a first placement lands on may already exist (a previous placement created it, or the project made it), but each placement owns its **own** per-instance reference children — whatever the scenario, an update placing a function where it has no instance included. So a reference into an already-existing shared satellite is reported as **added** (the container itself is matched and contributed to), never a no-op — unless the project's container already names the very element it names (one a source element was mapped onto): then it is not written twice. The report and the apply read one rule: [the contribution](#contribute-—-a-first-placement-onto-a-shared-element).
:::

### On `apply` / `update` — a 3-way merge

A layer-specific satellite is a shared element: where a source satellite lands is the answer of its [mapping](#shared-element-mappings), read by the report and by the apply. A cross-cutting one is the instance's own: it lands on the one the instance holds for it, else a new one. For each satellite the update verb does one of:

- **add** — the newer template references a satellite the instance holds nothing for, and its mapping resolves to a new element (a `Variable` / `BehaviorDescription`: always, one of the instance's own) → clone it at its structural level and stamp instance lineage (so a newly-referenced `AllocationRole` / `Variable` travels on update, not only on first-time instantiate);
- **reconcile in place** — the element the instance holds for it → reconcile it: in full when it was created from the template, only what the source contributes below it when it is the project's own;
- **delete** — the satellite **element** was removed from the template → delete the instance's one; while something outside the instance names it or is named by it (another instance's function, another application's reference), only the references the instance gave it go. The report lists exactly that.

::: warning Catalog persistence — un-referencing is not deletion
`FunctionCategory`, `AllocationRole`, `Variable` and `BehaviorDescription` are **catalog / documentation** elements: a category classifies many functions, a role is shared for harmonization, a variable targets many elements of its instance. So **un-referencing a satellite does not delete it** — only removing the element from the template does. Dropping the _link_ (e.g. a removed `AllocationRoleRef`) removes only the reference element and leaves the catalog element in place.
:::

## Engine

The update verbs are built on two engine primitives in `extensions/lifecycle/engine`.

### reconcile — apply-core

`reconcile(tx, { sourceQuery, sourceRootRef, instanceRootRef, matchKey, identityMode, bumpsCollisions, removalBase, namesFollow })` reconciles an updated template subtree **onto** an existing instance, with the fields of the scenario's policy (the verbs derive it, `scenarioPolicy`). Elements match by the scenario's key: `templateUuid` (= the source element's `uuid`, immutable across template versions), `uuid` for a fork:

- matched element → update its user-visible attributes in place, and its text when it holds text only (no element child on either side: a `BayType`, an `IEDName`), its surrounding whitespace aside. The vendor data a matched element holds as the text of a wrapper of its own type (`<Private type="ACME">v1</Private>`, which the compared trees otherwise see through) is paired with the instance's wrapper of that `type`: a text the template changed is written there, a wrapper the instance lacks is added, one only the instance holds is the project's and is kept. Each is listed as a node of its own with its `textChange`, decided as an attribute change is;
- new source element → add its subtree (via [`transplant.deep`](./transplant) + `identity.writeIdentity` stamp), then auto-resolve a name [collision](#placement-collision-resolution) on the added element against its instance parent. An element the template holds inside a transparent wrapper (a `Private`, which the compared trees show through) is added inside the instance parent's wrapper of the same `type` — the one it holds, else a new one with the template wrapper's attributes —, never beside it;
- instance element whose template lineage is gone from the source → delete — except a level of the topology (a `Substation`, `VoltageLevel` or `Bay`) in a template update: its lineage names the template level it was made from, not the template that placed it, and another template placed in a level of the unit carries one too. Such a level is **target-only**, kept unless its removal is accepted (a fork given its previous revision removes a level that revision held);
- instance **reference** element (a uuid-less link such as a dropped `AllocationRoleRef`) with no matching source child → removed, so the link disappears when the template drops it.
- instance element with **no** template lineage that the pipeline did not create (an author-added element such as a `DOS`/`DAS` added to an `LNode` after instantiation) → **target-only**: reported as its own decision group defaulting to keep, preserved by default and deleted only when that group is explicitly accepted. Pipeline-created naming/provenance (`LNodeSpecNaming`, `FunctionSclRef`, …) is excluded and the transparent `Private` wrapper is unwrapped.

Because the instance is already in instance-space, comparing template to instance is clean once identity and the project-owned `name` are excluded (a fork compares the `name` too: its names follow the revision, `namesFollow`) — no attribute-suppression heuristics. A type reference (`lnType`) is the exception: an id of each document, compared by the type it names (see [Decision groups](#decision-groups-full-track)); a matched element whose type changed is pointed at the type the template's closure resolves to, imported once the reconcile is done.

`reconcile` returns the clone mappings of what it added (each source record and the copy made of it).

#### References added by an update

An element the update adds may refer to an element outside the subtree it was added with: a function the same update instantiates, a satellite it creates, or an element the instance already holds. Once everything the update adds to an instance exists, the update verbs repoint those references (`repointAddedReferences`): the uuid is replaced by the uuid of the project element and the path is rebuilt, exactly as on a first instantiate.

The project element is the one carrying the source element's lineage. When the template was instantiated several times, several elements carry it: the one the instance contains or already refers to is taken, so each instance points at its own elements. A reference that cannot be told apart is left untouched.

### diff — report + classify

`diff({ sourceQuery, targetQuery, sourceRootRef, instanceRootRef })` is a **pure query** that produces a `DiffReport` without mutating:

```ts
type DiffReport = {
	instances: ReportInstance[] // one entry per matched instance (both layers for an ASD)
	needsDecisions: boolean
	summary: { added: number; removed: number; modified: number; kept: number } // kept: changes listed, not applied
	mappings: ReportMapping[] // where each shared source element lands — one entry per source element
	templateInstances: AnyRefOrRecord[] // the instances of the template itself the report covers; none on a first placement
	offLevel?: { templateLevel: string; startedFrom: string } // set when started above the level the template was made for
	revisionBase?: 'given' | 'absent' // a fork's report: whether the previous revision of the file was given
	scopeUnits?: ReportedElement[] // an SSD's units placed together: the one named and those linked to it
}

type ReportInstance = {
	rootRef?: AnyRefOrRecord // the instance root; omitted for a first-time instantiate
	placedFor?: AnyRefOrRecord // a first placement made several times: what this one is made for
	title: string // human label (e.g. "Prot" vs "Prot_1")
	linked: boolean // recognised as an instantiation of the loaded template
	upToDate: boolean // nothing to apply for this instance (no groups); it may still carry kept changes
	tree: DiffNode // full diff tree for this instance (unchanged context included)
	groups: DecisionGroup[] // this instance's accept/skip units
	mappings: ReportMapping[] // where the shared source elements this instance refers to land
	variantsNotSelected?: AnyRefOrRecord[] // the template's variants an application instance did not select
}
```

Matched by the scenario's key (`templateUuid`, `uuid` for a fork), same-space attribute compare. **Classify** decides the track: no instance = first-time instantiate = **fast** (headless); an existing instance with any change = **full** (needs decisions). This is the report a headless/review wrapper consumes to route fast vs full.

### contribute — a first placement onto a shared element

What a first placement brings into an element the project already holds — a role or a category its mapping lands on, the own content of a level of an SSD mapped onto the project's — is poured by one rule, `contribute`, that the report reads as a dry diff (`describeContribution`) and a copy will write too:

- a container lands on the child the project holds for it — carrying its uuid as lineage anywhere below, else of its name — and nothing the project holds is rewritten, whoever made it;
- a reference is the placement's own: added, unless the child it lands beside already names the very element it names (an element a source element was mapped onto); one naming what the placement does not place ([its scope](#two-kinds)) is not written, nor what the consumer left out;
- what it adds is finalized with the rest of the placement: a reference to an element it places elsewhere names that element.

Pairing is [the shared matcher](#child-matching-—-one-shared-matcher)'s, so the review and the write pair the same children.

### Child matching — one shared matcher

`reconcile` (apply) and `diff` (report) pair a source child to its instance child through **one** shared matcher (`matchChild`), so the preview and the write always agree on which elements correspond:

- **identified** elements match by their lineage under the scenario's key (`templateUuid`, `uuid` for a fork), guarded to the same tag — a placeholder `templateUuid` reused across unrelated element types (see [`checkTemplateUuids`](#identity-integrity-—-checktemplateuuids)) never matches across types;
- a uuid-less **reference** link (e.g. `FunctionRef`) matches by its reference identity — the target it points to, brought back to the source by the same key: its target's `templateUuid`, or for a fork the target's `uuid` itself — never by tag position. A reference whose uuids disagree is the project's own and the template's is new: listed `removed` and `added` (or kept, in a shared element). A project authored with placeholder lineages asks for more with `resolution.referencesByName: 'placeholders'`: such a reference then pairs by the names of what both name, but only where the project's target carries a lineage [`checkTemplateUuids`](#identity-integrity-—-checktemplateuuids) flags (`cross-type-template-uuid` or `template-uuid-type-mismatch`), read once per report and per apply. Each pairing made so is marked on its node (`DiffNode.pairedByName`, the placeholder) and listed in `report.warnings` (`ReportWarning`, code `reference-paired-by-name`); a shared element whose only news is such a pairing is listed with the instance's tree;
- anything else falls back to position.

Because both sides share this matcher, `apply` can no longer pair a child differently from the `report` that gated it: the apply path carries the same cross-type guard and reference-identity matching as the report.

## Identity integrity — `checkTemplateUuids`

`query.lifecycle.checkTemplateUuids()` is a generic, read-only check over the whole document. It
returns a `TemplateUuidWarning[]`, each a **definitive** SCL identity-integrity violation (not a
heuristic) that a consumer can surface as a warning. Template lineage matching relies on these
invariants holding, so a project that breaks them (e.g. an authoring tool that stamps one
placeholder `templateUuid` across many elements) can be flagged before it is merged.

```ts
type TemplateUuidWarningCode =
	| 'cross-type-template-uuid' // one templateUuid borne by elements of ≥2 element types
	| 'duplicate-instance-uuid' // one uuid used by ≥2 elements (instance uuids must be unique)
	| 'template-uuid-type-mismatch' // a templateUuid resolves in-file to an element of another type

type TemplateUuidWarning = {
	code: TemplateUuidWarningCode
	level: 'warning'
	value: string // the offending uuid / templateUuid
	tagNames: string[] // the distinct element types involved (the evidence)
	refs: AnyRefOrRecord[] // every element involved — for select/highlight
	count: number
	message: string
}
```

Legitimate same-type `templateUuid` sharing (multi-instance) and unique values are never reported.

Each warning's `message` describes one offending occurrence. To explain the violation **class** and
the engine's recovery, render `TEMPLATE_UUID_WARNING_INFO[warning.code]` — a per-code
`{ title, description, fallback }` map. It is the single source of truth for that copy, so a consumer
UI never re-authors (and drifts from) the explanation.

```ts
type TemplateUuidWarningInfo = {
	title: string // short name for the violation class
	description: string // what it is, in plain terms (why lineage can't be trusted)
	fallback: string // what the engine does about it — a fact about the engine, not an instruction for a user
}

const TEMPLATE_UUID_WARNING_INFO: Record<TemplateUuidWarningCode, TemplateUuidWarningInfo>
```
