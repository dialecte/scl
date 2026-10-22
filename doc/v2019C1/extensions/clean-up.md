---
description: Clean-up extension for @dialecte/scl v2019C1 -- post-mutation integrity helpers for orphan refs, LNode bindings, and empty containers.
---

# Clean-up

Post-mutation integrity helpers accessible via `tx.cleanUp`. Also called internally by `extract.asd`/`fsd` via `postExtractionCleanup`.

## Transaction methods

| Method                 | Purpose                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `orphanUuidRefs`       | Clear or delete UUID reference attributes pointing to missing targets                                   |
| `resetLNode`           | Release the LNodes, data and signals that name a logical node or an ExtRef / ExtCtrl the document lacks |
| `pruneEmptyContainers` | Delete empty REF container nodes and empty Private nodes                                                |

```ts
await doc.transaction(async (tx) => {
	await tx.cleanUp.orphanUuidRefs()
	await tx.cleanUp.resetLNode()
	await tx.cleanUp.pruneEmptyContainers()
})
```

Deleting a `PowerSystemRelation` (directly, or by deleting the equipment it names) needs no call: when it was the last one of its `PowerSystemRelations`, that container is removed with it, and so is the `Private` wrapping it when nothing else is in it.

## `resetLNode`

An `LNode` bound to an IED names the logical node that implements it, and that logical node must be in the document.

```ts
resetLNode(params?: { elements?: Scl.Ref<Scl.ElementsOf>[] }): Promise<void>
```

Without `elements`, every `LNode`, `DOS` / `SDS` / `DAS` and `SourceRef` / `ControlRef` of the document; with them, only those among the elements given (others are left aside). For each:

- assigned to no IED → `iedName="None"` is written when absent or empty;
- bound, its logical node in the document → left as it is. With an `lnUuid`, only the logical node carrying that uuid counts; without one, the logical node its naming (`iedName` / `ldInst` / `prefix` / `lnClass` / `lnInst`) names;
- bound, its logical node absent → assigned to no IED: `iedName="None"`, `lnUuid` removed, `ldInst` / `prefix` / `lnClass` / `lnInst` from its `LNodeSpecNaming`, which keeps its values (without one, `ldInst` is removed and the rest kept). Nothing in a device is removed (unlike [`dataModel.unlockLNode`](./data-model#unlocklnode));
- bound or not, its `DOS` / `SDS` / `DAS` mapped to a logical node, its `SourceRef` / `ControlRef` naming an `ExtRef` / `ExtCtrl`, the document does not hold → that name (uuid and path) is removed, the element stays. An `LNode` implemented by several logical nodes, or sharing one, is assigned to no IED and names them there.

`templateUuid` is never touched. The extract clean-up runs it on the whole document; `tx.lifecycle.apply` runs it on the elements it wrote.
