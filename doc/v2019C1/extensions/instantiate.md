---
title: Instantiate
---

# Instantiate

Instantiate template content into a target document — the inverse direction of the [extract](./extract) operation. Each operation clones a template subtree together with its type closure and stamps instance lineage.

Each operation takes `scenario` (`LifecycleScenario`, default `'instantiate'`), the identity it places with: `'instantiate'` (and `'template'`) places a **new instance** — a fresh `uuid` on every element, the template's as its `templateUuid`, the provenance of the file it came from, and a name collision numbered; `'fork'` places the **file's own elements** — their `uuid`s kept, no lineage stamped, no `FunctionSclRef` / `ApplicationSclRef` of their own; a name a sibling of the project already holds is numbered there too. An SSD placement records the file in the project's `Header` in every scenario. The update verbs place with their own scenario when the project holds no instance yet (see [Update](./update#scenario-—-instantiate-vs-template-vs-fork)).

## fsd

Access via `tx.lifecycle.instantiate` inside a `doc.transaction()` callback.

`fsd({ sourceQuery, functionRef, targetParent, scenario? })` instantiates the content an FSD carries into a target document:

1. clone the function subtree and its content-addressed type closure under `targetParent` (via [`transplant.deep`](./transplant));
2. place the `FunctionCategory` classification that references the function: mapped onto the category the project already holds (see [Shared elements are mapped, not copied](#shared-elements-are-mapped-not-copied)), else cloned at its structural level in the target project — the target Substation/VoltageLevel/Bay structure is resolved from `targetParent` (which may be a `Bay`, `VoltageLevel`, or `Substation`);
3. place the external cross-cutting [satellites](./update#satellites) (`Variable` / `BehaviorDescription`) that apply to any element in the function subtree: each instance gets its own, cloned at its own structural level and numbered when its name is taken there;
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

The clone's uuid references are repointed by [`reference.applyUuidRemap`](./reference#applyuuidremap) over the recipe's combined clone mappings — deep clone itself is purely structural. The function records the FSD it was placed from: the engine writes its `FunctionSclRef` → `SclFileReference` (the FSD's `Header` `uuid`, `version`, `revision`, and the file name), unless the function is placed as part of a larger template or by a fork. SET-specific policy — naming conventions, application assignment — is applied by consumer-registered hooks, not by the operation.

Returns `{ functionRef, cloneMappings }` — the instantiated root (retagged to `SubFunction` when placed under a `(Sub)Function`) and `cloneMappings`: each source record and the copy made of it, for everything the operation cloned (the function subtree and the categories, variables and behaviour descriptions carried with it), so a caller can act on the placed function without re-querying by `templateUuid`.

## asd

`asd({ sourceQuery, applicationRef, targetParent, scenario? })` instantiates the content an ASD carries — the **application layer** — into a target document:

1. clone the `Application` and its composed Functions, categories and satellites (`AllocationRole`, dataflow refs, …) with their type closure, under the structure resolved from `targetParent` (via the shared `layers/application` take-over, built on [`transplant.deep`](./transplant)), together with the external cross-cutting [satellites](./update#satellites) (`Variable` / `BehaviorDescription`) that apply to the Application or its content, one of each per instance;
2. stamp instance lineage (via [`identity.writeIdentity`](./identity#writeidentity) in `stamp-template` mode) on every cloned element, so each records its ASD counterpart as its `templateUuid` while receiving a fresh `uuid`; an element whose schema carries an origin (the `Application`, its roles, categories, variables) conserves the one the ASD element carries as its `originUuid`, or takes the ASD element's own `templateUuid` as its origin — a `fork` keeps the source `uuid`s and lineage instead;
3. validate the placed `Application` and each composed Function against their parent context and auto-resolve a scoped-uniqueness [collision](./update#placement-collision-resolution) on their `name`, each at its own structural level.

### Shared elements are mapped, not copied

An `AllocationRole` is an element the project holds once and several applications refer to. A role the ASD brings is **mapped** onto the project's role when the project has exactly one role of that name: it is not cloned, its function references are added to the project role, and the application's `AllocationRoleRef` points at it. The project role keeps its own attributes and receives no `templateUuid` — it is not an instance of the template's role.

With no role of that name, the role is created like any cloned element, and a name already taken at its level is bumped to a free one. With several, none is picked and none is created: the mapping is left undecided (`report.needsDecisions`), and `instantiate.asd` and `apply` refuse (`MAPPING_UNDECIDED`) until the consumer passes a choice in `resolution.mappings` — `{ existing }` or `{ create: {} }`.

A role the project holds because an earlier placement of the same template created it comes first: it is the one proposed, even when it was renamed since.

A `Variable` and a `BehaviorDescription` do not: they configure the instance placed, which gets its own — cloned, never mapped onto the project's element of its name, numbered when its name is taken where it lands — and a reference to them (`VariableRef`, `BehaviorDescriptionRef`) points at that instance's one.

A `FunctionCategory` follows the same rule, for a function, an application's composed functions and an SSD alike: mapped onto the project's category of that name, its classifications (`FunctionCatRef`) are added to it — inside the project's `SubCategory` of the same name when the source nests them — and an application's `FunctionCategoryRef` points at the project's category or sub-category.

`report` resolves the mapping the same way, so the review shows the role as a companion matched onto the project role, with only the contributed references added. It also lists the mapping, with every project role as a candidate, and the consumer may choose another one or a new role — see [Shared-element mappings](./update#shared-element-mappings).

```ts
await project.transaction(async (tx) => {
	await tx.lifecycle.instantiate.asd({
		sourceQuery: asd.query,
		applicationRef: { tagName: 'Application', id: 'app-1' },
		targetParent: { tagName: 'Bay', id: 'bay-1' },
	})
})
```

`asd` is the exact application-layer counterpart of [`extract.asd`](./extract#asd): both compose the same `layers/application` take-over, differing only in direction (extract breaks the root's link, instantiate stamps). The engine writes the `ApplicationSclRef` naming the ASD on the placed `Application` (the functions it composes keep the `FunctionSclRef` of the FSD each was placed from); SET policy (assign-to-application) is applied by consumer hooks.

Returns `{ applicationRef, composedFunctionRefs, cloneMappings }` — the instantiated `Application`, its composed root Functions, and `cloneMappings`: each source record and the copy made of it, for everything the operation cloned (a shared element mapped onto a project element is not cloned, so it has no entry).

## ssd

`ssd({ sourceQuery, scopeRef?, targetParent, scenario?, overrides?, keepNameTypesFrom? })` instantiates the process-section content an SSD carries — the **topology layer**, one level above `asd` — into a target project:

1. `cloneTopologyContent` (`layers/topology`) REPRODUCES the source structural skeleton (`Substation`/`VoltageLevel`/`Bay` + their own `BayType`, equipment, connectivity) by name under `targetParent`, via `ensureTopologyFrame`: an ancestor level the target already provides is reused, the rest — the scope root and everything below it — is created. Multiple voltage levels/bays in the scope are each reproduced at their own level (never collapsed together). It then consumes the application/function layers to place each `Application` (with its composed Functions) and each standalone `Function`, under its name-correct reproduced level, together with the external cross-cutting [satellites](./update#satellites) applying to the scope;
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
