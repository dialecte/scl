---
title: Update
---

# Update

Update reconciles a project against a **newer version of a template** it was built from. Each update verb is `instantiate-or-reconcile`: if the target has no instance yet it instantiates (the first-time case); if it already holds an instance, it reconciles the changes **onto** that instance instead of duplicating it.

```ts
// apply
tx.lifecycle.update.fsd(...)
tx.lifecycle.update.asd(...)
// preview (read-only) — returns a DiffReport with the fast/full classification
doc.query.lifecycle.update.reportFsd(...)
doc.query.lifecycle.update.reportAsd(...)
```

::: info Engine primitives stay internal
The `reconcile` / `diff` primitives below (in `extensions/lifecycle/engine`) are **internal** building blocks the registered verbs are built on; consumers import them directly only when composing new verbs.
:::

## `tx.lifecycle.update.fsd`

Access via `tx.lifecycle.update` inside a `doc.transaction()` callback.

`fsd({ sourceQuery, functionRef, targetParent })` reconciles a project against a (possibly newer) FSD:

- if the target already holds an instance of this Function (an element under `targetParent` whose `templateUuid` equals the source Function's `uuid`), reconcile the updated template onto it;
- otherwise instantiate it fresh (via [`instantiate.fsd`](./instantiate#fsd)).

This unifies instantiate and update — instantiation is the first-time case of update. The read-only counterpart `doc.query.lifecycle.update.reportFsd({ sourceQuery, functionRef, targetParent })` returns a `DiffReport` (see [Engine](#engine)) without mutating.

## `tx.lifecycle.update.asd`

`asd({ sourceQuery, applicationRef, targetParent })` reconciles a project against a (possibly newer) ASD — the same engine one layer up, proving `engine.reconcile` is layer-agnostic. It runs two layers in order:

1. **application layer** — reconcile the `Application` subtree (roles, allocation refs, attributes);
2. **function-layer cascade** — _verbs compose verbs_: treat every composed Function the ASD references as an FSD to update and delegate to `tx.lifecycle.update.fsd`. A function **added** by the newer ASD is instantiated; an existing one is reconciled. Each function is placed at its **own** resolved structural level (via `resolveTargetStructure` + `resolveStructureRef`, exactly like [`instantiate.asd`](./instantiate#asd)), not blindly under the ASD anchor.

The read-only counterpart is `doc.query.lifecycle.update.reportAsd({ sourceQuery, applicationRef })`.

> Cascade principle (applies to future update layers, e.g. SSD/topology): an update layer = reconcile its own subtree **+** for each referenced child-layer root, delegate to that child layer's update verb with the child's own resolved structural parent.

## Engine

The update verbs are built on two engine primitives in `extensions/lifecycle/engine`.

### reconcile — apply-core

`reconcile(tx, { sourceQuery, sourceRootRef, instanceRootRef })` reconciles an updated template subtree **onto** an existing instance. Elements match by `templateUuid` (= the source element's `uuid`, immutable across template versions):

- matched element → update its user-visible attributes in place;
- new source element → graft its subtree (via [`transplant.deep`](./transplant) + `identity.writeIdentity` stamp);
- instance element whose template lineage is gone from the source → delete.

Because the instance is already in instance-space, comparing template to instance is clean once identity and the project-owned `name` are excluded — no attribute-suppression heuristics.

### diff — report + classify

`diff({ sourceQuery, targetQuery, sourceRootRef, instanceRootRef })` is a **pure query** that produces a `DiffReport` without mutating:

```ts
type DiffReport = {
	root: DiffNode // change: added | removed | modified | unchanged, attributeChanges, children
	needsDecisions: boolean
	summary: { added: number; removed: number; modified: number }
}
```

Matched by `templateUuid`, same-space attribute compare. **Classify** decides the track: no instance = first-time instantiate = **fast** (headless); an existing instance with any change = **full** (needs decisions). This is the report a headless/review wrapper consumes to route fast vs full.
