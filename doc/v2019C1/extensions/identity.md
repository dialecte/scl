---
title: Identity
---

# Identity

Helpers for instance-lineage identity (`uuid` / `templateUuid` / `originUuid`): a transaction side that **writes** lineage onto cloned records, and a query side that **resolves** how an element is identified (used to match a source element to its instance).

## writeIdentity

Access via `tx.identity` inside a `doc.transaction()` callback.

`writeIdentity({ mappings, mode })` walks the clone `mappings` — each carries the source record's original attributes, so no cross-document query is needed — and writes lineage onto every target according to `mode`:

| mode             | direction                                | effect                                                                                                                                                                                                                                                |
| ---------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stamp-template` | template → instance (instantiate/update) | `templateUuid ← source.uuid`; for element types whose schema carries a two-level lineage, `originUuid ← source.templateUuid` (only when the origin slot is still free). The instance `uuid` is already fresh from `deepClone`.                        |
| `strip`          | project → template (extract)             | drops `templateUuid` and `originUuid`, leaving a fresh template.                                                                                                                                                                                      |
| `preserve`       | copy → copy (copy/paste)                 | keeps the fresh `deepClone` uuid but carries `templateUuid`/`originUuid` verbatim, so a pasted copy stays an instance of the same template it was copied from. Written as a no-op (the clone already copied lineage when cloned with `strip: false`). |
| `keep`           | peer ↔ peer (fork)                       | leaves lineage untouched.                                                                                                                                                                                                                             |

Whether an element carries `originUuid` is read from the dialect definition, so the two-level shift applies exactly to the element types that support it (application-layer elements such as `Application`, `AllocationRole`, `FunctionRole`, `SourceRef`) and never to single-level structural elements (`Function`, `SubFunction`, `LNode`, `Bay`).

```ts
await doc.transaction(async (tx) => {
	await tx.identity.writeIdentity({ mappings, mode: 'stamp-template' })
})
```

The `mappings` are the `CloneMapping[]` produced by a `deepClone` (or the extract / instantiate operations), so `writeIdentity` runs as a post-clone pass.

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
