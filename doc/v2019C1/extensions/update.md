---
title: Update
---

# Update

Update reconciles a project against a **newer version of a template** it was built from. The lifecycle surface exposes two explicit operations via `scenario`: **`instantiate`** places a new instance (duplicates allowed), while **`update`** reconciles a newer template **onto** an existing instance instead of duplicating it. With `scenario: 'update'` and no instance yet, update falls back to the first-time instantiate.

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
query.lifecycle.report({ verb, scenario, sourceQuery, ref, anchor }) // -> DiffReport { instances, needsDecisions, summary }
tx.lifecycle.apply(tx, { verb, scenario, sourceQuery, ref, anchor, report, keepNameTypesFrom? }) // -> ApplyResult { report, instances }
```

- `verb`: `'fsd'` (then `ref` is a `Function`) or `'asd'` (then `ref` is an `Application`) — the **layer**;
- `scenario`: `'instantiate'` or `'update'` — the **operation** (see below; defaults to `'update'`);
- `anchor`: the target parent the instance lives under / is placed into.
- `keepNameTypesFrom`: on a type-dedup name clash, which side keeps the type name — `'target'` (default, destination is the naming authority) or `'source'` (the incoming template).

### Apply result

`apply` returns an `ApplyResult`: the effective `report` plus `instances`, the instance roots the write
produced or reconciled. A consumer acts on the roots **in the same transaction** (name, wire, select,
chain) without re-deriving them. Flat arrays are scenario-honest — `instantiate` yields one root set;
`update` may reconcile several instances of one template; the not-decided-yet track yields empty arrays.
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
```

### Scenario — instantiate vs update

`instantiate` and `update` are **distinct operations**, chosen explicitly by the consumer — dialecte does not infer one from the other (a same-version re-upload is a valid duplicate, so inference is unsafe):

- **`instantiate`** — place a **new** instance of the template. Duplicates are allowed: re-applying the same template yields **another** instance (never a silent no-op), with a sibling name collision auto-resolved (e.g. `HMI` → `HMI_1`, and its composed functions `Prot` → `Prot_1`). The placed `name` is an editable field so the user can override the auto-resolved value.
- **`update`** — reconcile the template **onto** its existing instance(s). If none exists yet it is the first-time case (instantiate); with existing instances it reconciles in place and never duplicates.

`report.needsDecisions` gates the track:

- **fast** (`false`) — first-time instantiate or a conflict-free change → `apply` writes headless (pass no `decisions`). User value edits still ride through if `decisions` are supplied;
- **full** (`true`) — the instance exists and something changed → `apply` needs `decisions`. Without them it writes **nothing** and returns the report so the caller can drive the review; with them it applies only the accepted groups (across both layers for an ASD).

### Decision groups (full track)

`report` is a list of instances (`report.instances`), one {@link ReportInstance} per matched
instance; each instance owns its accept/skip `groups` (07 §3.1). `allGroups(report)` flattens the
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
	editableAttributes?: EditableAttribute[] // schema-derived editable fields of `primary`
}

// which attributes of the primary a UI may edit (and how) — derived from the schema,
// so the report is self-describing and the UI never re-derives them
type EditableAttribute = { attr: string; mode: 'rename' | 'free' }
```

Schema-derived classification also decides what is **not** editable: reference attributes (paths/uuids and type-id refs such as `lnType` and `DO`/`SDO`/`DA`/`BDA` `type`) are `reference` — system-owned, resolved internally, never surfaced as editable. On top of that, a **locked `LNode`** (bound to an IED — `iedName` set, not `'None'`) owns its implementation identity (`iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst`) and `lnType`: `reconcile` never overwrites them, even when a UI-instructed edit lists them. The binding is the lock (`dataModel.isLNodeLocked`); a dangling binding stays locked until orphan cleanup resolves it.

`apply` takes `decisions: Map<groupId, GroupDecision>` where a decision is either a plain
accept/skip or an object carrying **edited values** for the group's `editableAttributes`:

```ts
type GroupDecision =
	| 'accept'
	| 'skip'
	| { action: 'accept' | 'skip'; values?: Record<string, string> }
```

A group absent from the map defaults to its `suggestedAction` — `accept` for most changes (so an
empty map applies everything), but `skip` for a `target-only` group, so an author-added element is
kept unless the user explicitly opts into removing it. The engine rejects a set that accepts a group
whose `dependsOn` parent is skipped.

### Multiple instances of one template

Several instances of one template may live under one anchor (each with a unique instance `uuid`,
sharing one `templateUuid`). `report` enumerates **every** instance and returns one
{@link ReportInstance} per instance in `report.instances`, each carrying its own `groups`, `title`,
and `memberIds`. There is **one** report holding all instances.

The decision map is the selector: accept the groups of the instances you want and skip the rest to
update a **subset** (e.g. 2 of 4). `apply` reconciles each instance independently, gated by only its
own groups. A UI iterates `report.instances`, labels each section with the instance `title`, and keys
the `decisions` map by `group.id` (already scoped per instance, so globally unique).

### Placement collision resolution

When a group is accepted and its primary is **placed** (a first-time instantiate, a composed function,
or a add onto an existing instance), the engine validates it against its parent context and
auto-resolves a scoped-uniqueness collision (e.g. two children with the same `name` under one Bay →
`Prot` becomes `Prot_1`). Identity-only collisions are left untouched (never a silent delete + create).

The engine always **owns uniqueness**. A `values` override lets the user set an editable field (typically
`name`): the user's value is applied first, then uniqueness is re-ensured — a user name that itself
collides is still bumped. Only attributes listed in the group's `editableAttributes` are honoured.

#### Conflict classification at report time (`instantiate`)

`report` classifies placement collisions **before** apply so the UI can surface them. It is generic over
any scoped-uniqueness constraint and any field combination (a constraint may span several fields), and
scenario-aware. For each placed group primary it partitions the violated constraint's `fields` into
**editable** (`rename`/`free`) vs **identity**:

- **resolvable** — at least one field is editable: the engine can make a distinct copy. The report flags
  that field on the group's `editableAttributes` with `conflict: true` and the collision-free
  `suggestedValue` (the UI pre-fills it; the user may override). No decision is required.
- **identity-locked** — every field is identity (none editable): the primary is identity-equal to an
  existing element and cannot be duplicated. The report sets `group.conflict = { fields, adoptTargetId }`
  and `needsDecisions: true`, so the user chooses **skip** (leave the existing element) or **adopt**
  (reconcile the template onto `adoptTargetId` — i.e. update that existing element in place). Adopt is a
  non-destructive reconcile, never a delete + recreate.

`update` never classifies a conflict: an identity match there is the **reconcile target**, not a collision.

```ts
type EditableAttribute = {
	attr: string
	mode: 'rename' | 'free'
	conflict?: boolean // engine auto-resolved a placement collision on this field
	suggestedValue?: string // the collision-free value it proposes (resolvable case)
}

type GroupConflict = { fields: string[]; adoptTargetId: string } // identity-locked

type DecisionGroup = {
	// …
	editableAttributes?: EditableAttribute[]
	conflict?: GroupConflict // identity-locked collision → skip | adopt
}
```

Wrap `apply` in `doc.prepare(...)` for a previewable, reversible dry-run:

```ts
const target = {
	verb: 'fsd',
	scenario: 'instantiate', // or 'update'
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

const prepared = await doc.prepare((tx) => tx.lifecycle.apply(tx, { ...target, report, decisions }))
await prepared.commit() // or prepared.discard()
```

### Presentation scope

`presentationScope(target)` is a small, layer-derived descriptor a UI can use to render the merge as a **structural tree**: where to root it, which top-level SCL sections are irrelevant to the layer, and which to include alongside the rooted subtree. For `fsd` / `asd` it roots at `Substation`, includes `DataTypeTemplates` (a sibling of `Substation` that the layer references), and omits `Communication` and `IED` (the IED layer will bring `IED` back into scope).

```ts
import { presentationScope } from '@dialecte/scl/v2019C1'

const { rootTag, omit, include } = presentationScope(target)
// { rootTag: 'Substation', omit: ['Communication', 'IED'], include: ['DataTypeTemplates'] }
```

````

## `tx.lifecycle.update.fsd`

Access via `tx.lifecycle.update` inside a `doc.transaction()` callback.

`fsd({ sourceQuery, functionRef, targetParent })` reconciles a project against a (possibly newer) FSD:

- if the target already holds an instance of this Function (an element under `targetParent` whose `templateUuid` equals the source Function's `uuid`), reconcile the updated template onto it;
- otherwise instantiate it fresh (via [`instantiate.fsd`](./instantiate#fsd)).

This unifies instantiate and update — instantiation is the first-time case of update. The read-only counterpart `doc.query.lifecycle.report({ verb: 'fsd', sourceQuery, ref: functionRef, anchor: targetParent })` returns a `DiffReport` (see [Engine](#engine)) without mutating.

## `tx.lifecycle.update.asd`

`asd({ sourceQuery, applicationRef, targetParent })` reconciles a project against a (possibly newer) ASD — the same engine one layer up, proving `engine.reconcile` is layer-agnostic. It runs two layers in order:

1. **application layer** — reconcile the `Application` subtree (roles, allocation refs, attributes);
2. **function-layer cascade** — _verbs compose verbs_: treat every composed Function the ASD references as an FSD to update and delegate to `tx.lifecycle.update.fsd`. A function **added** by the newer ASD is instantiated; an existing one is reconciled. Each function is placed at its **own** resolved structural level (via `resolveTargetStructure` + `resolveStructureRef`, exactly like [`instantiate.asd`](./instantiate#asd)), not blindly under the ASD anchor.

The read-only counterpart is `doc.query.lifecycle.report({ verb: 'asd', sourceQuery, ref: applicationRef })`.

> Cascade principle (applies to future update layers, e.g. SSD/topology): an update layer = reconcile its own subtree **+** for each referenced child-layer root, delegate to that child layer's update verb with the child's own resolved structural parent.

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

### On `apply` / `update` — a 3-way merge

For each satellite the update verb does one of:

- **add** — the newer template references a satellite the target lacks → clone it at its structural level and stamp instance lineage (so a newly-referenced `AllocationRole` / `Variable` travels on update, not only on first-time instantiate);
- **reconcile in place** — an existing instance satellite → reconcile its changed attributes onto it;
- **delete** — the satellite **element** was removed from the template → delete the instance, **guarded** by a whole-document last-referrer check so a satellite still referenced by another primary is kept.

::: warning Catalog persistence — un-referencing is not deletion
`FunctionCategory`, `AllocationRole`, `Variable` and `BehaviorDescription` are **catalog / shared / documentation** elements: a category classifies many functions, a role is shared for harmonization, a variable targets many elements. So **un-referencing a satellite does not delete it** — only removing the element from the template does. Dropping the *link* (e.g. a removed `AllocationRoleRef`) removes only the reference element and leaves the catalog element in place.
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

### diff — report + classify

`diff({ sourceQuery, targetQuery, sourceRootRef, instanceRootRef })` is a **pure query** that produces a `DiffReport` without mutating:

```ts
type DiffReport = {
	instances: ReportInstance[] // one entry per matched instance (both layers for an ASD)
	needsDecisions: boolean
	summary: { added: number; removed: number; modified: number }
}

type ReportInstance = {
	rootRef?: AnyRefOrRecord // the instance root; omitted for a first-time instantiate
	title: string // human label (e.g. "Prot" vs "Prot_1")
	linked: boolean // recognised as an instantiation of the loaded template
	upToDate: boolean // nothing to apply for this instance (no groups)
	tree: DiffNode // full diff tree for this instance (unchanged context included)
	groups: DecisionGroup[] // this instance's accept/skip units
	memberIds: string[] // every element id of this instance (subtree + satellites) — select/highlight
}
````

Matched by `templateUuid`, same-space attribute compare. **Classify** decides the track: no instance = first-time instantiate = **fast** (headless); an existing instance with any change = **full** (needs decisions). This is the report a headless/review wrapper consumes to route fast vs full.

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
