---
title: Identity
---

# Identity

Transaction helpers for writing instance-lineage identity (`uuid` / `templateUuid` / `originUuid`) onto cloned records.

## writeIdentity

Access via `tx.identity` inside a `doc.transaction()` callback.

`writeIdentity({ mappings, mode })` walks the clone `mappings` — each carries the source record's original attributes, so no cross-document query is needed — and writes lineage onto every target according to `mode`:

| mode             | direction                                | effect                                                                                                                                                                                                        |
| ---------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stamp-template` | template → instance (instantiate/update) | `templateUuid ← source.uuid`; for element types whose schema carries a two-level lineage, `originUuid ← source.templateUuid` (only when the origin slot is still free). The instance `uuid` is already fresh from `deepClone`. |
| `strip`          | project → template (extract)             | drops `templateUuid` and `originUuid`, leaving a fresh template.                                                                                                                                             |
| `keep`           | peer ↔ peer (fork)                       | leaves lineage untouched.                                                                                                                                                                                    |

Whether an element carries `originUuid` is read from the dialect definition, so the two-level shift applies exactly to the element types that support it (application-layer elements such as `Application`, `AllocationRole`, `FunctionRole`, `SourceRef`) and never to single-level structural elements (`Function`, `SubFunction`, `LNode`, `Bay`).

```ts
await doc.transaction(async (tx) => {
	await tx.identity.writeIdentity({ mappings, mode: 'stamp-template' })
})
```

The `mappings` are the `CloneMapping[]` produced by a `deepClone` (or the recipes in the extraction extension), so `writeIdentity` runs as a post-clone pass.
