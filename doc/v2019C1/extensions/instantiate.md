---
title: Instantiate
---

# Instantiate

Instantiate template content into a target document — the inverse direction of the [extract](./extract) operation. Each operation clones a template subtree together with its type closure and stamps instance lineage. The types written are the closure of the logical nodes placed: a logical node the operation does not place brings no type. The mechanism is [`transplant.deep`](./transplant), which imports the closure of the logical nodes it cloned.

Each operation takes `scenario` (`LifecycleScenario`, default `'instantiate'`), the identity it places with: `'instantiate'` (and `'template'`) places a **new instance** — a fresh `uuid` on every element, the template's as its `templateUuid`, the provenance of the file it came from, and a name collision numbered; `'fork'` places the **file's own elements** — their `uuid`s kept, no lineage stamped, no `FunctionSclRef` / `ApplicationSclRef` of their own; a name a sibling of the project already holds is numbered there too. An SSD placement records the file in the project's `Header` in every scenario. The update verbs place with their own scenario when the project holds no instance yet (see [Update](./update#scenario-—-instantiate-vs-template-vs-fork)).

## The root of a template file

`doc.query.lifecycle.sourceRoot.fsd()` / `.asd()` / `.ssd()` read, from the template file, the element a verb takes as its `ref`. They only read, and they never throw on the shape of a file: the answer is data, so a pre-flight can show it before any report is asked for.

```ts
const root = await templateFile.query.lifecycle.sourceRoot.fsd()
if (root.kind === 'found') {
	await project.transaction(async (tx) => {
		await tx.lifecycle.instantiate.fsd({
			sourceQuery: templateFile.query,
			functionRef: root.ref,
			targetParent: { tagName: 'Bay', id: 'bay-1' },
		})
	})
}
```

| `kind`        | Meaning                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `found`       | The one root: `ref` is the ref the verb takes.                                                                                               |
| `several`     | The file holds several: `candidates`, in document order, each `{ ref, name, linked }`; the consumer picks one and passes its `ref`.          |
| `none`        | The file holds no root.                                                                                                                      |
| `unsupported` | `fsd` only: the file holds an equipment function (`EqFunction`) and no function; `ref` is the first in document order. Not instantiable yet. |

What each verb finds:

- **`fsd`** — a `Function` at a level of the `TEMPLATE` scaffolding, or a `FunctionTemplate` in the `Private` of the document root. A subfunction is not a root. A file holding a function template and a function, or two functions, holds several. A `Function` plus an `EqFunction` resolves to the `Function`: the placeable roots are judged first, and an equipment function counts only when the file holds none.
- **`asd`** — an `Application`. A function alone is not an application: `none`.
- **`ssd`** — the first named level below the `TEMPLATE` scaffolding, as the SSD verbs resolve it: units joined by a reference (a terminal of one on a connectivity node of the other, an input fed by the other) are one element, found as the scaffolding holding them; a scaffolding with nothing named below it is found at its deepest `TEMPLATE` level; several unlinked units are `several`, each candidate listing the units linked to it in `linked` (`{ ref, name }`). `linked` is empty for `fsd` and `asd`.

## fsd

Access via `tx.lifecycle.instantiate` inside a `doc.transaction()` callback.

`fsd({ sourceQuery, functionRef, targetParent, scenario? })` instantiates the content an FSD carries into a target document:

1. clone the function subtree and its content-addressed type closure under `targetParent` (via [`transplant.deep`](./transplant));
2. place the `FunctionCategory` classification that references the function: mapped onto the category the project already holds (see [Shared elements are mapped, not copied](#shared-elements-are-mapped-not-copied)), else cloned at its structural level in the target project — the target Substation/VoltageLevel/Bay structure is resolved from `targetParent` (which may be a `Bay`, `VoltageLevel`, or `Substation`). Only its references to the function and what it holds are placed: a reference to another function of the file is not (see [a satellite's scope](./update#two-kinds));
3. place the external cross-cutting [satellites](./update#satellites) (`Variable` / `BehaviorDescription`) that apply to any element in the function subtree: each instance gets its own, cloned at its own structural level and numbered when its name is taken there, applying to what the operation places only;
4. stamp instance lineage (via [`identity.writeIdentity`](./identity#writeidentity) in `stamp-template` mode) on every cloned element, so each records its FSD counterpart as its `templateUuid` while receiving a fresh `uuid`, and conserves the origin the FSD element carries as its `originUuid` (or takes the FSD element's own `templateUuid` as its origin) — a `fork` keeps the source `uuid`s and lineage instead;
5. validate the placed function against its parent context and auto-resolve a scoped-uniqueness [collision](./update#placement-collision-resolution) on its `name` (e.g. instantiating the same template twice under one Bay yields `Prot` then `Prot_1`).

```ts
await project.transaction(async (tx) => {
	await tx.lifecycle.instantiate.fsd({
		sourceQuery: fsd.query,
		functionRef: { tagName: 'Function', id: 'fn-1' },
		targetParent: { tagName: 'Bay', id: 'bay-1' },
	})
})
```

The clone's uuid references are repointed by [`reference.applyUuidRemap`](./reference#applyuuidremap) over the recipe's combined clone mappings — deep clone itself is purely structural. The function records the FSD it was placed from: the engine writes its `FunctionSclRef` → `SclFileReference` (the FSD's `Header` `uuid`, `version`, `revision`, and the file name), unless the function is placed as part of a larger template or by a fork. A consumer applies its own policy — naming conventions, application assignment — through the hooks it registers, not the operation.

Returns `{ functionRef, cloneMappings }` — the instantiated root (retagged to `SubFunction` when placed under a `(Sub)Function`) and `cloneMappings`: each source record and the copy made of it, for everything the operation cloned (the function subtree and the categories, variables and behaviour descriptions carried with it), so a caller can act on the placed function without re-querying by `templateUuid`.

## asd

`asd({ sourceQuery, applicationRef, targetParent, scenario?, sharedFunctions? })` instantiates the content an ASD carries — the **application layer** — into a target document:

1. clone the `Application` and its composed Functions, categories and satellites (`AllocationRole`, dataflow refs, …) with their type closure, under the structure resolved from `targetParent` (via the shared `layers/application` take-over, built on [`transplant.deep`](./transplant)), together with the external cross-cutting [satellites](./update#satellites) (`Variable` / `BehaviorDescription`) that apply to the Application, its content or a Function it composes, one of each per instance;
2. stamp instance lineage (via [`identity.writeIdentity`](./identity#writeidentity) in `stamp-template` mode) on every cloned element, so each records its ASD counterpart as its `templateUuid` while receiving a fresh `uuid`; an element whose schema carries an origin (the `Application`, its roles, categories, variables) conserves the one the ASD element carries as its `originUuid`, or takes the ASD element's own `templateUuid` as its origin — a `fork` keeps the source `uuid`s and lineage instead;
3. validate the placed `Application` and each composed Function against their parent context and auto-resolve a scoped-uniqueness [collision](./update#placement-collision-resolution) on their `name`, each at its own structural level.

### Functions applications share

By default (`sharedFunctions: 'clone'`) each placement of an application places the functions it composes, its own. With `sharedFunctions: 'merge'` (in `resolution` for `report` and `apply`), a composed function the level it lands on already holds with an identical template reference — its lineage is the composed function's uuid, or names a function of the file made from the same template element (`templateUuid`) — is stood on instead of placed: the application's `FunctionRef` names it, and a role already allocating it is not given it twice. One found is taken, and the report lists it as a mapping (`locked`: the option decided it); several are the consumer's to choose (a mapping without `mapping`, `needsDecisions`, `apply` refusing with `MAPPING_UNDECIDED` until `{ existing }` or `{ create: {} }` is passed); none, the function is placed. Only the level the function lands on is looked at, and only a function of the project carrying a lineage: two files made from one library function hold no trace of it in the project, their functions stay apart. Two functions the application composes stay two: a function one of them stands on is not free for the other. The option is read for an application placed on its own (`verb: 'asd'`); the applications an SSD unit holds are placed with the unit, their functions its own.

### Shared elements are mapped, not copied

An `AllocationRole` is an element the project holds once and several applications refer to. A role the ASD brings is **mapped** onto the project's role when the element of the project its own level lands on (the bay, voltage level or substation whose `Private` holds it) holds exactly one role of that name — a role is identified by where it sits: one of that name elsewhere in the project is not matched, only offered as a candidate the consumer may choose: it is not cloned, its references to the functions the placement places are added to the project role (each once: [the contribution](./update#contribute-—-a-first-placement-onto-a-shared-element)), and the application's `AllocationRoleRef` points at it. The project role keeps its own attributes and receives no `templateUuid` — it is not an instance of the template's role.

A level of the template the structure it is placed under has no level of the tag for lands on the nearest level above it that the structure has, where the placement writes what it holds. With no role of that name there (or its level created by the placement), the role is created like any cloned element, and a name already taken at its level is bumped to a free one. With several there, none is picked and none is created: the mapping is left undecided (`report.needsDecisions`), and `instantiate.asd` and `apply` refuse (`MAPPING_UNDECIDED`) until the consumer passes a choice in `resolution.mappings` — `{ existing }` or `{ create: {} }`.

A role the project holds because an earlier placement of the same template created it comes first: it is the one proposed, even when it was renamed since.

A `Variable` and a `BehaviorDescription` do not: they configure the instance placed, which gets its own — cloned, never mapped onto the project's element of its name, numbered when its name is taken where it lands — and a reference to them (`VariableRef`, `BehaviorDescriptionRef`) points at that instance's one.

A `FunctionCategory` follows the same rule, for a function, an application's composed functions and an SSD alike: mapped onto the category of that name where its own level lands, its classifications (`FunctionCatRef`) are added to it — inside the project's `SubCategory` of the same name when the source nests them — and an application's `FunctionCategoryRef` points at the project's category or sub-category.

On a first placement each is resolved once, before the placement writes anything: what the placement creates for one application or function is never what another one's role or category of the same name maps onto. A role made from the same template element by an earlier placement (it carries the element's uuid as `templateUuid`) is matched the same way, only where its level lands: a template element may be instantiated several times, so a bay typical placed twice gives each bay its own role. On an update, a role or category the template gained is written in the level its instance sits in, and found by name or lineage there only. `report` resolves the mapping the same way, so the review shows the role as a companion matched onto the project role, with only the contributed references added. It also lists the mapping, with every project role as a candidate, and the consumer may choose another one or a new role — see [Shared-element mappings](./update#shared-element-mappings).

```ts
await project.transaction(async (tx) => {
	await tx.lifecycle.instantiate.asd({
		sourceQuery: asd.query,
		applicationRef: { tagName: 'Application', id: 'app-1' },
		targetParent: { tagName: 'Bay', id: 'bay-1' },
	})
})
```

`asd` is the exact application-layer counterpart of [`extract.asd`](./extract#asd): both compose the same `layers/application` take-over, differing only in direction (extract breaks the root's link, instantiate stamps). The engine writes the `ApplicationSclRef` naming the ASD on the placed `Application` (the functions it composes keep the `FunctionSclRef` of the FSD each was placed from); a consumer applies its own policy (application assignment) through the hooks it registers.

Returns `{ applicationRef, composedFunctionRefs, cloneMappings }` — the instantiated `Application`, its composed root Functions, and `cloneMappings`: each source record and the copy made of it, for everything the operation cloned (a shared element mapped onto a project element is not cloned, so it has no entry).

## ssd

`ssd({ sourceQuery, scopeRef?, targetParent, scenario?, overrides?, keepNameTypesFrom? })` instantiates the process-section content an SSD carries — the **topology layer**, one level above `asd` — into a target project:

1. `cloneTopologyContent` (`layers/topology`) REPRODUCES the source structural skeleton (`Substation`/`VoltageLevel`/`Bay` + their own `BayType`, equipment, connectivity) by name under `targetParent`, via `ensureTopologyFrame`: an ancestor level the target already provides is reused, the rest — the scope root and everything below it — is created. Multiple voltage levels/bays in the scope are each reproduced at their own level (never collapsed together). It then consumes the application/function layers to place each `Application` (with its composed Functions) and each standalone `Function`, under its name-correct reproduced level, together with the external cross-cutting [satellites](./update#satellites) applying to the scope or to a function its applications compose, and those its levels hold, each in the element holding it;
2. write the identity of the scenario on every cloned element:
   - `scenario: 'instantiate'` (default) — bay-typical reuse: fresh `uuid` + `templateUuid` lineage, the origin the SSD element carries conserved as its `originUuid` (or its own `templateUuid` taken as the origin), then a scoped-uniqueness [collision](./update#placement-collision-resolution) auto-resolved on each placed root (`Application` / standalone `Function`) at its own structural level, so instantiating the same SSD twice yields a second, distinct set of instances;
   - `scenario: 'fork'` — project base: adopt the SSD's own `uuid`s as-is (no re-stamp; a name a sibling holds is still numbered) — turning an SSD into a project's starting content, or the first fork of a file;
3. record the instantiation **once**, at document level (`Header > SourceFiles`, via [`reference.writeProvenance`](./reference#writeprovenance)) — not per element, since the whole scope came from one source file; a file version the `Header` already lists is not listed again.

The scope is the element `scopeRef` names: a named `Substation`, `VoltageLevel` or `Bay` is placed as it is (one bay of a template holding several independent ones). The `TEMPLATE` scaffolding — named, or the file's substations when `scopeRef` is absent — is walked down the `Substation → VoltageLevel → Bay` chain to the first level holding a named element; a scaffolding with nothing named below it is its deepest level. Units of that level joined by a reference (a terminal of one on a connectivity node of the other, an input of one fed by the other) are one element to instantiate: naming one, or their scaffolding when they are all it holds, places them together in one placement — rooted at the `TEMPLATE` scaffolding, which lands on the project's level of its kind, each level where its mapping says — so a reference from one to the other names the element placed from the other. Several elements at that level and none chosen is refused with `SSD_SCOPE_AMBIGUOUS` (`SCL2003`), `meta.candidates` listing one per element (`{ tagName, id, name, linked }`); the units the chosen element does not hold are left out.

```ts
await project.transaction(async (tx) => {
	await tx.lifecycle.instantiate.ssd({
		sourceQuery: ssd.query,
		targetParent: { tagName: 'Bay', id: 'bay-1' },
	})
})
```

Returns `{ scopeRef, cloneMappings }` — the SSD-side scope root that was instantiated, and `cloneMappings`: each source record and the copy made of it, for everything the operation cloned (the reproduced frame, the placed fn/app content and the cross-cutting satellites carried with them).
