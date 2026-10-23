---
title: Identity
---

# Identity

Helpers for instance-lineage identity (`uuid` / `templateUuid` / `originUuid`): a transaction side that **writes** lineage onto cloned records, and a query side that **resolves** how an element is identified (used to match a source element to its instance).

## writeIdentity

Access via `tx.identity` inside a `doc.transaction()` callback.

`writeIdentity({ cloneMappings, mode, ... })` is the one writer of instance lineage (`templateUuid` / `originUuid`). A clone copies the lineage of every element as the source holds it; `writeIdentity` then decides it, from the `cloneMappings` — each carries the source record's attributes, so the source document is read only where `preserve` needs a cloned root's parent:

| mode             | direction                                | params                                                                              | effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stamp-template` | template → instance (instantiate/update) | —                                                                                   | `templateUuid ← source.uuid`; for element types whose schema carries a two-level lineage, `originUuid ← source.originUuid`, else `source.templateUuid`: the origin of the template is conserved, the template's own template becomes the origin. The instance `uuid` is fresh from `deepClone`.                                                                                                                                                                                |
| `keep`           | peer ↔ peer (fork, project base)         | —                                                                                   | lineage as the clone copied it (the uuids are restored by [`restoreClonedUuids`](#restorecloneduuids)).                                                                                                                                                                                                                                                                                                                                                                        |
| `preserve`       | copy → copy (copy/paste)                 | `sourceQuery`, `sourceRoots` (the source elements cloned, as the source holds them) | lineage as copied, where the new parent is an instance of the same template: an element whose source parent — its nearest ancestor carrying a lineage — carries a `templateUuid` and is not a `Substation` / `VoltageLevel` / `Bay` keeps its lineage only when its new parent carries the same `templateUuid`; otherwise its lineage goes, and so does the lineage of what it holds. A function, an application or a level copied anywhere stays an instance of its template. |
| `strip`          | project → template (extract)             | `unlinked`                                                                          | the elements named in `unlinked` (source record ids) lose their template link, `templateUuid` and `originUuid`; every other element keeps its lineage.                                                                                                                                                                                                                                                                                                                         |

Whether an element carries `originUuid` is read from the dialect definition, so the origin applies exactly to the element types that support it (application-layer elements such as `Application`, `AllocationRole`, `FunctionCategory`, `SourceRef`, `Variable`) and never to single-level structural elements (`Function`, `SubFunction`, `LNode`, `Bay`). A lineage attribute is written only when it differs from what the clone copied.

```ts
await doc.transaction(async (tx) => {
	await tx.identity.writeIdentity({ cloneMappings, mode: 'stamp-template' })
	await tx.identity.writeIdentity({
		cloneMappings,
		mode: 'strip',
		unlinked: new Set([rootSourceId]),
	})
	await tx.identity.writeIdentity({
		cloneMappings,
		mode: 'preserve',
		sourceQuery: source.query,
		sourceRoots,
	})
})
```

The `cloneMappings` are the `CloneMapping[]` produced by a `deepClone` (or the extract / instantiate operations), so `writeIdentity` runs as a post-clone pass. The lifecycle operations reach it through one seam that also fixes up the uuids for the mode: the fresh uuids are kept and the references inside the clone repointed onto them, except for `keep`, which gives each element its source uuid back.

## restoreClonedUuids

`restoreClonedUuids({ cloneMappings })` gives each cloned element its source `uuid` back. A clone always mints a fresh element `uuid` (`beforeClone` strips it, standardization fills a new one) but copies every reference uuid attribute verbatim. A **fork** converges the target to the same identity as the source revision, so restoring the element uuids is enough: a reference inside the clone already points at its source-space target.

```ts
await doc.transaction(async (tx) => {
	await tx.identity.restoreClonedUuids({ cloneMappings })
})
```

A mapping whose source carries no `uuid`, or whose clone already carries the source one, is left as it is.

## resolveIdentity

Resolves an element's **identity strategy** from the schema — how a source element is matched to its instance across a clone. Access via `identity.query.resolveIdentity(query, ref)`.

```ts
identity.query.resolveIdentity(
  query: Scl.Query,
  ref: Scl.Ref<Scl.ElementsOf>,
): Promise<ElementIdentity>
```

`ElementIdentity` is one of:

| kind         | when                                                | how it is matched                                                                               |
| ------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `uuid`       | the schema gives the element a `uuid`               | by **lineage** — `instance.templateUuid === source.uuid` (or `uuid` for a fork). Never by name. |
| `fields`     | no `uuid`, but the schema declares `identityFields` | by that field tuple, preserved across a clone (e.g. `DataTypeTemplates` types by their `id`).   |
| `positional` | neither                                             | by position among siblings (leaf / config elements).                                            |

This is the single, schema-driven answer to "is this the same element?" — there is **no name fallback**. A same-name element that shares no lineage is never adopted as an instance. A project whose lineage was hand-authored with a placeholder `templateUuid` is a data defect surfaced by the `checkTemplateUuids` warning, not silently recovered here.

Whether an element carries a `uuid` is read from the schema via core's `getAttributeRules(...).isDefined` (`@dialecte/core/utils`) — one source of truth, no hardcoded tag lists.

`identityEquals(first, second)` compares two resolved identities.
