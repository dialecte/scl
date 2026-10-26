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
| `pruneEmptyContainers` | Delete the containers left holding nothing that have no reason to stay then                             |

```ts
await doc.transaction(async (tx) => {
	await tx.cleanUp.orphanUuidRefs()
	await tx.cleanUp.resetLNode()
	await tx.cleanUp.pruneEmptyContainers()
})
```

## `pruneEmptyContainers`

A container holding nothing — no child element, no text — goes when it has no reason to stay then. Read from the definition and the namespaces:

- an element whose content model needs a child it no longer holds, when it is a list with no identity of its own (no key fields, no uuid: `PowerSystemRelations`, `ProcessResources`, `LNodeInputs`, `DataTypeTemplates`, `Communication`) or a set of references (every child it needs is a reference: a `FunctionCategory` and its `FunctionCatRef`, a `Variable` and its `VariableApplyTo`);
- a transparent wrapper of the dialecte's own elements: a `Private` whose `type` is the prefix of a namespace the dialecte declares (`eIEC61850-6-100`).

Its parent is then judged the same way: the wrapper a category leaves empty goes too. An element of its own that needs a child (an `IED`, an `LNodeType`, an `Application`) is the project's to remove; a `Private` of another `type` is a tool's private data, kept empty or not; a level of the topology (`Substation`, `VoltageLevel`, `Bay`) is never removed.

```ts
pruneEmptyContainers(): Promise<void>
```

It judges every container of the document, deleted through the transaction (the delete hooks clean what refers to it): the extract clean-up runs it on the file it writes, whose containers may have been empty already.

What a transaction leaves holding nothing goes at its commit, whatever wrote — a delete, `tx.lifecycle.apply`, an extract: the parent of every element it deleted and every wrapper it created are judged by the same rule, once everything is written (a category whose reference the transaction swaps stays), and deleted with what refers to them, as a delete does. The delete hook removes the references naming what is deleted, and the references naming those in turn.

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
