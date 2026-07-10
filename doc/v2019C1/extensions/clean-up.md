---
description: Clean-up extension for @dialecte/scl v2019C1 -- post-mutation integrity helpers for orphan refs, LNode bindings, and empty containers.
---

# Clean-up

Post-mutation integrity helpers accessible via `tx.cleanUp`. Also called internally by `extract.asd`/`fsd` via `postExtractionCleanup`.

## Transaction methods

| Method                 | Purpose                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `orphanUuidRefs`       | Clear or delete UUID reference attributes pointing to missing targets         |
| `resetLNode`           | Reset orphaned LNode IED bindings (restore from LNodeSpecNaming when present) |
| `pruneEmptyContainers` | Delete empty REF container nodes and empty Private nodes                      |

```ts
await doc.transaction(async (tx) => {
	await tx.cleanUp.orphanUuidRefs()
	await tx.cleanUp.resetLNode()
	await tx.cleanUp.pruneEmptyContainers()
})
```
