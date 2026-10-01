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
query.lifecycle.report({ verb, scenario, sourceQuery, ref, anchor, resolution? }) // -> DiffReport { instances, needsDecisions, summary, mappings }
tx.lifecycle.apply(tx, { verb, scenario, sourceQuery, ref, anchor, report, resolution? }) // -> ApplyResult { report, instances }
```

- `verb`: `'fsd'` (then `ref` is a `Function`), `'asd'` (then `ref` is an `Application`), or `'ssd'` (then `ref` is the topology scope, `Substation`/`VoltageLevel`/`Bay` — see [the note below](#txlifecycleupdatessd)) — the **layer**;
- `scenario`: `'instantiate'` | `'template'` | `'fork'` — the **operation** (see below; defaults to `'template'`). `'template'` and `'fork'` are the two **Update** modes (`UpdateMode`);
- `anchor`: the target parent the instance lives under / is placed into.
- `resolution`: what the consumer resolved, as one object — `{ decisions?, mappings?, keepNameTypesFrom? }`. `apply` reads all of it; `report` reads `mappings`, so the report is re-derived from the consumer's choices and shows their consequence:
  - `decisions`: accept / skip (and edited values) per decision group — see [Decision groups](#decision-groups-full-track);
  - `mappings`: where a shared element lands, per source element — see [Shared-element mappings](#shared-element-mappings);
  - `keepNameTypesFrom`: on a type-dedup name clash, which side keeps the type name — `'target'` (default, destination is the naming authority) or `'source'` (the incoming template).

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
	editableAttributes?: EditableAttribute[] // schema-derived editable fields of `primary`
}

// which attributes of the primary a UI may edit (and how) — derived from the schema,
// so the report is self-describing and the UI never re-derives them
type EditableAttribute = { attr: string; mode: 'rename' | 'free' }
```

Schema-derived classification also decides what is **not** editable: reference attributes (paths/uuids and type-id refs such as `lnType` and `DO`/`SDO`/`DA`/`BDA` `type`) are `reference` — system-owned, resolved internally, never surfaced as editable. On top of that, a **locked `LNode`** (bound to an IED — `iedName` set, not `'None'`) owns its implementation identity (`iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst`) and `lnType`: `reconcile` never overwrites them, even when a UI-instructed edit lists them. The binding is the lock (`dataModel.isLNodeLocked`); a dangling binding stays locked until orphan cleanup resolves it.

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

### Shared-element mappings

Some elements are held once by the project and shared — an `AllocationRole` several applications refer to, a `FunctionCategory` classifying several functions. A template that brings such an element does not necessarily copy it: it **maps** it onto an element of the project, or creates a new one. `report` lists that decision for every shared element the template brings, and the consumer may change it.

```ts
type ReportMapping = {
	id: string // record id of the SOURCE element — the key of a choice made for it
	tagName: string
	mapping: DecisionMapping // where it lands, as resolved
	reason: 'decision' | 'lineage' | 'name' | 'none'
	ambiguous: boolean // several project elements qualified equally: none was picked
	selectable: boolean // the consumer may choose another mapping for an element of this kind
	locked: boolean // the instance being updated already carries this mapping: shown, not changeable
	candidates: { ref; title: string; path: string }[]
}

type DecisionMapping = { existing: Ref } | { create: { name?: string } }
```

- **Resolved by default**, first answer wins: the one project element created from this source element by an earlier placement, whatever it is named now (`reason: 'lineage'`); else the project element of the same name when there is exactly one (`'name'`); else a new element (`'none'`). Where several elements qualify equally, none is picked and a new element is created (`ambiguous: true`).
- **`candidates`**: every project element of that tag, listed from the placement outwards — the anchor's own level, each level above it, then the rest of the project. For a `locked` mapping, the one element it is mapped onto.
- **A new element** carries the name `apply` will give it: the source name, or the name the consumer asked for, made free at the level it lands on (`HMI_PC` → `HMI_PC_1`).

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

A choice the report cannot honour is refused, by `report` and by `apply`: a source element the template does not bring, a project element that is not among the candidates, a mapping that is not `selectable`, or one that is `locked`.

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

When the template drops a shared element altogether, the project element it was mapped onto stays too. What the instance had given it — its references pointing at an element of that instance — is announced as removed and removed when accepted; the references it holds for the project or for other instances are not touched.

A shared element the template brings that the instance holds nothing for (a role added by a newer template version) is resolved as on a first placement, and the consumer may choose. When the instance does hold elements that could stand for it but nothing tells which — two mapped roles with no function reference, both renamed since — none is guessed: the element is listed as new with `ambiguous: true`, and the consumer maps it.

Both `report` and `apply` read this one answer, so an update no longer creates a second element beside the one the instantiate mapped.

With several instances of one template, each instance has its own `mappings`. `report.mappings` lists each shared source element once: the mapping still to decide when an instance has yet to be given one (a choice reaches every such instance), else the mapping the instances carry.

### Multiple instances of one template

Several instances of one template may live under one anchor (each with a unique instance `uuid`,
sharing one `templateUuid`). `report` enumerates **every** instance and returns one
{@link ReportInstance} per instance in `report.instances`, each carrying its own `groups` and
`title`. There is **one** report holding all instances.

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

`report` flags the placement collisions the engine resolves by itself **before** apply, so the UI can
surface them. It is generic over any scoped-uniqueness constraint and any field combination (a constraint
may span several fields), and scenario-aware. For each placed group primary it looks at the violated
constraint's `fields`: when at least one is **editable** (`rename`/`free`) the engine can make a distinct
copy, and the report flags that field on the group's `editableAttributes` with `conflict: true` and the
collision-free `suggestedValue` (the UI pre-fills it; the user may override). No decision is required.

A collision whose key fields are all identity cannot be resolved by changing a value and is not flagged.
Every element a verb places as a group primary today is keyed by its `name`, so this does not occur.

`template`/`fork` never flag a collision: an identity match there is the **reconcile target**.

```ts
type EditableAttribute = {
	attr: string
	mode: 'rename' | 'free'
	conflict?: boolean // engine auto-resolved a placement collision on this field
	suggestedValue?: string // the collision-free value it proposes (resolvable case)
}

type DecisionGroup = {
	// …
	editableAttributes?: EditableAttribute[]
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

> Cascade principle: an update layer = reconcile its own subtree **+** for each referenced child-layer root, delegate to that child layer's update verb with the child's own resolved structural parent. `update.ssd` below applies it one layer up.

## `tx.lifecycle.update.ssd`

`ssd({ sourceQuery, scopeRef?, targetParent, scenario, report, decisions, keepNameTypesFrom })` reconciles a project against a (possibly newer) SSD — the topology layer, cascading down to `asd`/`fsd`:

- **first-time** — no scope primary (any `Application` or standalone `Function` under the scope) has an instance yet, or `scenario: 'instantiate'` — delegates whole to [`instantiate.ssd`](./instantiate#ssd), so the source is recorded **once** at document level, exactly like the direct verb (not scattered per primary);
- **reconcile** — an instance exists:
  1. **topology frame** — reconcile the scope's **own** structural content (`Substation`/`VoltageLevel`/`Bay` attributes, `BayType`, equipment) via `reconcileTopologyFrame`, matched to the instance by its stamped `templateUuid` lineage — rename-robust, so a renamed Bay still matches. The fn/app tags are a **boundary** here, excluded from this pass and left to the cascade below;
  2. **application cascade** — each `Application` under the scope, via [`update.asd`](#txlifecycleupdateasd) (which itself cascades to its composed Functions);
  3. **function cascade** — each standalone `Function` (not composed by any `Application`), via [`update.fsd`](#txlifecycleupdatefsd).

A part added by the newer SSD is instantiated; an existing one is reconciled — never blindly re-added.

The read-only counterpart is `doc.query.lifecycle.report({ verb: 'ssd', sourceQuery, anchor: targetParent })`, assembled the same way: the topology frame's own diff plus the union of the per-primary `reportAsd`/`reportFsd` reports, merged into one `DiffReport` so `report.groups` covers the whole scope and the fast/full classification holds across it.

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
}

type ReportInstance = {
	rootRef?: AnyRefOrRecord // the instance root; omitted for a first-time instantiate
	title: string // human label (e.g. "Prot" vs "Prot_1")
	linked: boolean // recognised as an instantiation of the loaded template
	upToDate: boolean // nothing to apply for this instance (no groups)
	tree: DiffNode // full diff tree for this instance (unchanged context included)
	groups: DecisionGroup[] // this instance's accept/skip units
}
````

Matched by `templateUuid`, same-space attribute compare. **Classify** decides the track: no instance = first-time instantiate = **fast** (headless); an existing instance with any change = **full** (needs decisions). This is the report a headless/review wrapper consumes to route fast vs full.

### Child matching — one shared matcher

`reconcile` (apply) and `diff` (report) pair a source child to its instance child through **one** shared matcher (`matchChild`), so the preview and the write always agree on which elements correspond:

- **identified** elements match by `templateUuid` lineage, guarded to the same tag — a placeholder `templateUuid` reused across unrelated element types (see [`checkTemplateUuids`](#identity-integrity-checktemplateuuids)) never matches across types;
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
	fallback: string // how the merge still proceeds (recognise by name, etc.)
}

const TEMPLATE_UUID_WARNING_INFO: Record<TemplateUuidWarningCode, TemplateUuidWarningInfo>
```
