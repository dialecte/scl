---
title: Instantiate
---

# Instantiate

Instantiate template content into a target document — the inverse direction of the [extract](./extract) operation. Each operation clones a template subtree together with its type closure and stamps instance lineage.

## fsd

Access via `tx.lifecycle.instantiate` inside a `doc.transaction()` callback.

`fsd({ sourceQuery, functionRef, targetParent })` instantiates the content an FSD carries into a target document:

1. clone the function subtree and its content-addressed type closure under `targetParent` (via [`transplant.deep`](./transplant));
2. clone the `FunctionCategory` classification that references the function, placed at its structural level in the target project — the target Substation/VoltageLevel/Bay structure is resolved from `targetParent` (which may be a `Bay`, `VoltageLevel`, or `Substation`);
3. clone the external cross-cutting [satellites](./update#satellites) (`Variable` / `BehaviorDescription`) that apply to any element in the function subtree, each at its own structural level;
4. stamp instance lineage (via `identity.writeIdentity` in `stamp-template` mode) on every cloned element, so each records its FSD counterpart as its `templateUuid` while receiving a fresh `uuid`;
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

The clone's uuid references are repointed by [`reference.applyUuidRemap`](./reference#applyuuidremap) over the recipe's combined clone mappings — deep clone itself is purely structural. SET-specific policy — naming conventions, file-reference provenance, application assignment — is applied by consumer-registered hooks, not by the operation.

Returns `{ functionRef, recordMappings }` — the instantiated root (retagged to `SubFunction` when placed under a `(Sub)Function`) and the full source→target `recordMappings`, so a caller can act on the placed function without re-querying by `templateUuid`.

## asd

`asd({ sourceQuery, applicationRef, targetParent })` instantiates the content an ASD carries — the **application layer** — into a target document:

1. clone the `Application` and its composed Functions, categories and satellites (`AllocationRole`, dataflow refs, …) with their type closure, under the structure resolved from `targetParent` (via the shared `layers/application` take-over, built on [`transplant.deep`](./transplant)), together with the external cross-cutting [satellites](./update#satellites) (`Variable` / `BehaviorDescription`) that apply to the Application or its content;
2. stamp instance lineage (via `identity.writeIdentity` in `stamp-template` mode) on every cloned element, so each records its ASD counterpart as its `templateUuid` while receiving a fresh `uuid`;
3. validate the placed `Application` and each composed Function against their parent context and auto-resolve a scoped-uniqueness [collision](./update#placement-collision-resolution) on their `name`, each at its own structural level.

```ts
await project.transaction(async (tx) => {
	await tx.lifecycle.instantiate.asd({
		sourceQuery: asd.query,
		applicationRef: { tagName: 'Application', id: 'app-1' },
		targetParent: { tagName: 'Bay', id: 'bay-1' },
	})
})
```

`asd` is the exact application-layer counterpart of [`extract.asd`](./extract#asd): both compose the same `layers/application` take-over, differing only in direction (extract strips, instantiate stamps). SET policy (`ApplicationSclRef` provenance, assign-to-application) is applied by consumer hooks.

Returns `{ applicationRef, composedFunctionRefs, recordMappings }` — the instantiated `Application`, its composed root Functions, and the full source→target `recordMappings`.
