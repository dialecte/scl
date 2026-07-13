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
3. stamp instance lineage (via `identity.writeIdentity` in `stamp-template` mode) on every cloned element, so each records its FSD counterpart as its `templateUuid` while receiving a fresh `uuid`.

```ts
await project.transaction(async (tx) => {
	await tx.lifecycle.instantiate.fsd({
		sourceQuery: fsd.query,
		functionRef: { tagName: 'Function', id: 'fn-1' },
		targetParent: { tagName: 'Bay', id: 'bay-1' },
	})
})
```

The clone's uuid references are remapped by the `afterDeepClone` hook. SET-specific policy — naming conventions, file-reference provenance, application assignment — is applied by consumer-registered hooks, not by the operation.

## asd

`asd({ sourceQuery, applicationRef, targetParent })` instantiates the content an ASD carries — the **application layer** — into a target document:

1. clone the `Application` and its composed Functions, categories and satellites (`AllocationRole`, dataflow refs, …) with their type closure, under the structure resolved from `targetParent` (via the shared `layers/application` take-over, built on [`transplant.deep`](./transplant));
2. stamp instance lineage (via `identity.writeIdentity` in `stamp-template` mode) on every cloned element, so each records its ASD counterpart as its `templateUuid` while receiving a fresh `uuid`.

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
