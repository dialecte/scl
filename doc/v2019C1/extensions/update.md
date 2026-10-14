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
query.lifecycle.report({ verb, scenario, sourceQuery, ref, anchor, resolution? }) // -> DiffReport { instances, needsDecisions, summary, mappings, templateInstances, offLevel? }
tx.lifecycle.apply(tx, { verb, scenario, sourceQuery, ref, anchor, report, resolution? }) // -> ApplyResult { report, instances }
```

The parameter types are exported as `LifecycleReportParams` (`LifecycleTarget & { resolution? }`), `LifecycleApplyParams` and `Resolution`.

- `verb`: `'fsd'` (then `ref` is a `Function` or a `FunctionTemplate` — `FsdFunctionRef`), `'asd'` (then `ref` is an `Application`), or `'ssd'` (then `ref` is the topology scope, `Substation`/`VoltageLevel`/`Bay` — see [the note below](#tx-lifecycle-update-ssd)) — the **layer**;
- `scenario`: `'instantiate'` | `'template'` | `'fork'` — the **operation** (see below; defaults to `'template'`). `'template'` and `'fork'` are the two **Update** modes (`UpdateMode`);
- `anchor`: the target parent the instance lives under / is placed into.
- `resolution`: what the consumer resolved, as one object — `{ decisions?, mappings?, keepNameTypesFrom?, afterApply? }` (type `Resolution`). `apply` reads all of it; `report` reads `mappings`, so the report is re-derived from the consumer's choices and shows their consequence:
  - `decisions`: accept / skip (and edited values) per decision group — see [Decision groups](#decision-groups-full-track);
  - `mappings`: where a shared element lands, per source element — see [Shared-element mappings](#shared-element-mappings);
  - `keepNameTypesFrom`: on a type-dedup name clash, which side keeps the type name — `'target'` (default, destination is the naming authority) or `'source'` (the incoming template);
  - `afterApply`: the consumer's own step, run once after the apply — see [below](#the-consumer-s-step-after-the-apply-—-resolution-afterapply).

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
forgets every `appliedRef` an earlier run filled: a node or a mapping the run leaves out carries none.

```ts
type DiffNode = {
	change: 'added' | 'removed' | 'modified' | 'unchanged' | 'target-only'
	sourceRef?: AnyRefOrRecord // template element (added / modified / unchanged)
	instanceRef?: AnyRefOrRecord // existing element (removed / modified / unchanged)
	appliedRef?: AnyRefOrRecord // what it became after apply (filled by apply; absent on a pure report)
	// ...tagName, attributeChanges, children
}
```

### Scenario — instantiate vs template vs fork

The scenarios are **distinct operations**, chosen explicitly by the consumer — dialecte does not infer one from the other (a same-version re-upload is a valid duplicate, so inference is unsafe). `template` and `fork` are the two modes of the **Update** action, distinguished by how the source relates to the target:

- **`instantiate`** — place a **new** instance of the template. Duplicates are allowed: re-applying the same template yields **another** instance (never a silent no-op), with a sibling name collision auto-resolved (e.g. `HMI` → `HMI_1`, and its composed functions `Prot` → `Prot_1`). The placed `name` is an editable field so the user can override the auto-resolved value.
- **`template`** — source is a **template**; reconcile it **onto** its existing instance(s). Elements match by `templateUuid` (= the source `uuid`); added elements are stamped with instance lineage. If none exists yet it is the first-time case (instantiate); with existing instances it reconciles in place and never duplicates. _(Was `update`.)_
- **`fork`** — source is a newer **revision of the same file**; reconcile it onto the prior revision, **keeping identity**. Source and target share `uuid`, so elements match by `uuid` (not `templateUuid`); the reconcile updates in place with **no re-stamp and no provenance**, deletes elements the new revision dropped, and adds a newly added element **keeping its source `uuid`** (so the target converges to the source revision's identity). The single-layer form of an SCD fork — e.g. bringing an FSD/ASD template from revision _n_ to _n+1_.

`report.needsDecisions` gates the track:

- **fast** (`false`) — first-time instantiate or a conflict-free change → `apply` writes headless (pass no `decisions`). User value edits still ride through if `decisions` are supplied;
- **full** (`true`) — the instance exists and something changed → `apply` needs `decisions`. Without them it writes **nothing** and returns the report so the caller can drive the review; with them it applies only the accepted groups (across both layers for an ASD).

### Decision groups (full track)

`report` is a list of instances (`report.instances`), one {@link ReportInstance} per matched
instance; each instance owns its accept/skip `groups`. `allGroups(report)` flattens the
groups across every instance. The user decides on a **group**, never an individual element — each
group carries its primary change plus the companions that travel with it, so a partial, incoherent
apply is impossible.

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
}

// derived from the schema, so the report is self-describing and the UI never re-derives them
type EditableAttribute = { attr: string; mode: 'rename' | 'free' }
```

The attributes classified are those the element's definition declares where it sits — the type it names with `xsi:type` included — not only the tag's. Each is `identity`, `reference`, `rename` or `free` (`AttributeEditability`); only the last two are listed. Schema-derived classification also decides what is **not** editable: reference attributes (paths/uuids and type-id refs such as `lnType` and `DO`/`SDO`/`DA`/`BDA` `type`) are `reference` — system-owned, resolved internally, never surfaced as editable. On top of that, a **locked `LNode`** (bound to an IED — `iedName` set, not `'None'`) owns its implementation identity (`iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst`) and `lnType`: `reconcile` never overwrites them, even when a UI-instructed edit lists them. The binding is the lock (`dataModel.isLNodeLocked`); a dangling binding stays locked until orphan cleanup resolves it.

`apply` takes `resolution.decisions: Map<groupId, GroupDecision>` where a decision is either a plain
accept/skip or an object carrying **edited values** for the group's `editableAttributes`:

```ts
type GroupDecision =
	'accept' | 'skip' | { action: 'accept' | 'skip'; values?: Record<string, string> }
```

A group absent from the map defaults to its `suggestedAction` — `accept` for most changes (so an
empty map applies everything), but `skip` for a `target-only` group, so an author-added element is
kept unless the user explicitly opts into removing it. The engine rejects a set that accepts a group
whose `dependsOn` parent is skipped.

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

Some elements are held once by the project and shared — an `AllocationRole` several applications refer to, a `FunctionCategory` classifying several functions, a `Variable` or a `BehaviorDescription` applying to several elements. A template that brings such an element does not necessarily copy it: it **maps** it onto an element of the project, or creates a new one. `report` lists that decision for every shared element the template brings, and the consumer may change it.

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
	selectable: boolean // the consumer may choose another mapping for an element of this kind
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

- **Resolved by default**, first answer wins: the one project element created from this source element by an earlier placement, whatever it is named now (`reason: 'lineage'`); else the project element of the same name when there is exactly one (`'name'`); else a new element (`'none'`). Where several elements qualify equally, none is picked (`ambiguous: true`): the mapping is left **undecided** — `mapping` is absent, the report sets `needsDecisions`, and `apply` refuses until the consumer passed a choice, an existing element or `{ create: {} }`. An element whose mapping cannot be chosen (`selectable: false`) is created under a free name instead.
- **`candidates`**: every project element of that tag, listed from the placement outwards — the anchor's own level, each level above it, then the rest of the project. For a `locked` mapping, the one element it is mapped onto.
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
	tx.lifecycle.apply(tx, {
		...target,
		report,
		resolution: { decisions, mappings: decisionMappings },
	}),
)
```

The mapping of a `Variable` or a `BehaviorDescription` is resolved and listed like the others, with `selectable: false`: it is shown, not chosen.

A choice the report cannot honour is refused, by `report` and by `apply`: a source element the template does not bring, a project element that is not among the candidates, a mapping that is not `selectable`, or one that is `locked`.

The element a source element is mapped onto stays the project's: its own attributes are neither compared nor written, it receives no `templateUuid`, and only what the source contributes below it (an `AllocationRole`'s function references, a `FunctionCategory`'s classifications) is added. The references to it follow (`AllocationRoleRef`, `FunctionCategoryRef`: uuid and path).

Inside such an element, a named container the source brings (a `SubCategory`) lands on the container the project element already has: the one created from it by an earlier placement, else the one of the same name — which is the project's too, so its attributes are left alone. A container with no counterpart is added. What the project element holds besides is neither announced nor touched.

Mappings are resolved for every verb — a function's categories (`verb: 'fsd'`, and the functions an application composes or an SSD carries), an application's roles (`verb: 'asd'`, or carried by an SSD), the variables and behaviour descriptions applying to any of them — on a first placement and on every update.

#### On an update

An update finds, for each instance, the project element that instance already holds for a shared source element, and keeps it: the mapping is listed with `reason: 'lineage'` and `locked: true`. Nothing is written in the file to remember a mapping; it is read from what the placement wrote, strongest evidence first:

1. the element was created from the source element (it carries its lineage) — it is an instance of it, reconciled in full, attributes included;
2. the element holds a reference to the project element standing for one the source element refers to (the function references a mapped `AllocationRole` was given) — so a role the project's author renamed since is still found;
3. the element has the same name;
4. it is the only element the instance holds, for the only shared element the template brings.

A step pairs a source element with a project element only when neither has another possibility. An element found by 2–4 is the project's own: only what the source contributes below it is added, reconciled or removed; its own attributes and its other children are left alone, and it is never deleted by an update.

When the template drops a shared element altogether, the project element it was mapped onto stays too. What the instance had given it — its references pointing at an element of that instance — is announced as removed and removed when accepted; the references it holds for the project or for other instances are not touched. A shared element the placement created (it carries the template's lineage) is removed as a whole: with the change of the element it belongs to, or as a decision of its own when that element is unchanged.

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

Instances of one template may share an element — an `AllocationRole`, a `FunctionCategory`, a
`Variable` — each giving it its **own** reference children (one `FunctionRef` per instance, each to
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

### Placement collision resolution

When a group is accepted and its primary is **placed** (a first-time instantiate, a composed function,
or a add onto an existing instance), the engine validates it against its parent context and
auto-resolves a scoped-uniqueness collision (e.g. two children with the same `name` under one Bay →
`Prot` becomes `Prot_1`). Identity-only collisions are left untouched (never a silent delete + create).

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
  of another namespace than the children it is meant for selects nothing.

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
- After the step, an application or function the apply placed or reconciled and the step renamed is made
  unique again: a name the step gives that is taken where the element sits is numbered all the same.

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
	tx.lifecycle.apply(tx, { ...target, report, resolution: { decisions } }),
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
   - a function that belongs to no instance is reconciled when it sits where the consumer started.

The read-only counterpart is `doc.query.lifecycle.report({ verb: 'asd', sourceQuery, ref: applicationRef })`.

> Cascade principle: an update layer = reconcile its own subtree **+** for each referenced child-layer root, delegate to that child layer's update verb with the child's own resolved structural parent. `update.ssd` below applies it one layer up.

## `tx.lifecycle.update.ssd`

`ssd({ sourceQuery, scopeRef?, targetParent, scenario, report, decisions, keepNameTypesFrom })` reconciles a project against a (possibly newer) SSD — the topology layer, cascading down to `asd`/`fsd`:

- **first-time** — no scope primary (any `Application` or standalone `Function` under the scope) has an instance yet, or `scenario: 'instantiate'` — delegates whole to [`instantiate.ssd`](./instantiate#ssd), so the source is recorded **once** at document level, exactly like the direct verb (not scattered per primary);
- **reconcile** — an instance exists:
  1. **topology frame** — reconcile the scope's **own** structural content (`Substation`/`VoltageLevel`/`Bay` attributes, `BayType`, equipment) via `reconcileTopologyFrame`, matched to the instance by its stamped `templateUuid` lineage — rename-robust, so a renamed Bay still matches. The fn/app tags are a **boundary** here, excluded from this pass and left to the cascade below;
  2. **application cascade** — each `Application` under the scope, via [`update.asd`](#tx-lifecycle-update-asd) (which itself cascades to its composed Functions);
  3. **function cascade** — each standalone `Function` (not composed by any `Application`), via [`update.fsd`](#tx-lifecycle-update-fsd).

A part added by the newer SSD is instantiated; an existing one is reconciled — never blindly re-added.

The read-only counterpart is `doc.query.lifecycle.report({ verb: 'ssd', sourceQuery, anchor: targetParent })`, assembled the same way: the topology frame's own diff plus the union of the per-primary `reportAsd`/`reportFsd` reports, merged into one `DiffReport` so the groups of `report.instances` cover the whole scope and the fast/full classification holds across it.

::: info `ref` is not the acted-upon scope
For `verb: 'ssd'`, `report`/`apply` always resolve the acted-upon scope as the SSD's **instantiable root** (same resolution as [`instantiate.ssd`](./instantiate#ssd)). `ref` is carried on `LifecycleTarget` for typing/UI symmetry with `fsd`/`asd`, but is not consulted — the scope is always derived from `sourceQuery`, not from the caller's `ref`.
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

### On `report` — companions, never independent

Each satellite's change folds into the **primary's** decision group as a read-only companion. Satellites are never independently decidable: accepting a group applies the primary **and** its satellites atomically; skipping applies neither. You cannot accept one side of a tightly-linked pair and leave the other broken.

The companion preserves the satellite's **structure**: when a change is nested inside a container that already exists in the target (e.g. a new reference added into an existing `FunctionCategory` / `SubCategory`), the existing container rides as the companion — anchored to its instance — carrying the added element **in place**, so a consumer can show and couple the addition against the real container rather than as a detached node.

::: info Instantiate creates its own references
On `scenario: 'instantiate'`, a shared satellite container may already exist (a previous instantiation created it), but each instantiation owns its **own** per-instance reference children. So a reference into an already-existing shared satellite is reported as **added** (the container itself is matched and merged into), never a no-op — mirroring what `apply` writes (the new references are merged into the existing container).
:::

### On `apply` / `update` — a 3-way merge

Every satellite tag is a shared element: where a source satellite lands is the answer of its [mapping](#shared-element-mappings), read by the report and by the apply. For each satellite the update verb does one of:

- **add** — the newer template references a satellite the instance holds nothing for, and its mapping resolves to a new element → clone it at its structural level and stamp instance lineage (so a newly-referenced `AllocationRole` / `Variable` travels on update, not only on first-time instantiate);
- **reconcile in place** — the element the instance holds for it → reconcile it: in full when it was created from the template, only what the source contributes below it when it is the project's own;
- **delete** — the satellite **element** was removed from the template → delete the instance, **guarded** by a whole-document last-referrer check so a satellite still referenced by another primary is kept.

::: warning Catalog persistence — un-referencing is not deletion
`FunctionCategory`, `AllocationRole`, `Variable` and `BehaviorDescription` are **catalog / shared / documentation** elements: a category classifies many functions, a role is shared for harmonization, a variable targets many elements. So **un-referencing a satellite does not delete it** — only removing the element from the template does. Dropping the _link_ (e.g. a removed `AllocationRoleRef`) removes only the reference element and leaves the catalog element in place.
:::

## Engine

The update verbs are built on two engine primitives in `extensions/lifecycle/engine`.

### reconcile — apply-core

`reconcile(tx, { sourceQuery, sourceRootRef, instanceRootRef })` reconciles an updated template subtree **onto** an existing instance. Elements match by `templateUuid` (= the source element's `uuid`, immutable across template versions):

- matched element → update its user-visible attributes in place;
- new source element → add its subtree (via [`transplant.deep`](./transplant) + `identity.writeIdentity` stamp), then auto-resolve a name [collision](#placement-collision-resolution) on the added element against its instance parent;
- instance element whose template lineage is gone from the source → delete;
- instance **reference** element (a uuid-less link such as a dropped `AllocationRoleRef`) with no matching source child → removed, so the link disappears when the template drops it.
- instance element with **no** template lineage that the pipeline did not create (an author-added element such as a `DOS`/`DAS` added to an `LNode` after instantiation) → **target-only**: reported as its own decision group defaulting to keep, preserved by default and deleted only when that group is explicitly accepted. Pipeline-created naming/provenance (`LNodeSpecNaming`, `FunctionSclRef`, …) is excluded and the transparent `Private` wrapper is unwrapped.

Because the instance is already in instance-space, comparing template to instance is clean once identity and the project-owned `name` are excluded — no attribute-suppression heuristics.

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
	summary: { added: number; removed: number; modified: number }
	mappings: ReportMapping[] // where each shared source element lands — one entry per source element
	templateInstances: AnyRefOrRecord[] // the instances of the template itself the report covers; none on a first placement
	offLevel?: { templateLevel: string; startedFrom: string } // set when started above the level the template was made for
}

type ReportInstance = {
	rootRef?: AnyRefOrRecord // the instance root; omitted for a first-time instantiate
	placedFor?: AnyRefOrRecord // a first placement made several times: what this one is made for
	title: string // human label (e.g. "Prot" vs "Prot_1")
	linked: boolean // recognised as an instantiation of the loaded template
	upToDate: boolean // nothing to apply for this instance (no groups)
	tree: DiffNode // full diff tree for this instance (unchanged context included)
	groups: DecisionGroup[] // this instance's accept/skip units
	mappings: ReportMapping[] // where the shared source elements this instance refers to land
}
```

Matched by `templateUuid`, same-space attribute compare. **Classify** decides the track: no instance = first-time instantiate = **fast** (headless); an existing instance with any change = **full** (needs decisions). This is the report a headless/review wrapper consumes to route fast vs full.

### Child matching — one shared matcher

`reconcile` (apply) and `diff` (report) pair a source child to its instance child through **one** shared matcher (`matchChild`), so the preview and the write always agree on which elements correspond:

- **identified** elements match by `templateUuid` lineage, guarded to the same tag — a placeholder `templateUuid` reused across unrelated element types (see [`checkTemplateUuids`](#identity-integrity-—-checktemplateuuids)) never matches across types;
- a uuid-less **reference** link (e.g. `FunctionRef`) matches by its reference identity — the target it points to, mapped back to template space — with a resolved-name fallback for placeholder-lineage projects, never by tag position;
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
