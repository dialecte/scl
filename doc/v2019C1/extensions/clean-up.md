---
description: Clean-up extension for @dialecte/scl v2019C1 -- post-mutation integrity helpers for orphan refs, LNode bindings, empty containers, and unused data types.
---

# Clean-up

Post-mutation integrity helpers accessible via `tx.cleanUp`. Also called internally by `extract.asd`/`fsd` via `postExtractionCleanup`.

## Transaction methods

| Method                 | Purpose                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `orphanUuidRefs`       | Clear or delete UUID reference attributes pointing to missing targets                                   |
| `resetLNode`           | Release the LNodes, data and signals that name a logical node or an ExtRef / ExtCtrl the document lacks |
| `pruneEmptyContainers` | Delete the containers left holding nothing that have no reason to stay then                             |
| `pruneUnusedTypes`     | Delete the data types nothing in the document names, with the types only they name                      |

```ts
await doc.transaction(async (tx) => {
	await tx.cleanUp.orphanUuidRefs()
	await tx.cleanUp.resetLNode()
	await tx.cleanUp.pruneEmptyContainers()
	await tx.cleanUp.pruneUnusedTypes()
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

The same commit removes the data types the transaction left unused (below), then judges the containers: a `DataTypeTemplates` left holding nothing goes in that commit.

## `pruneUnusedTypes`

An `LNodeType`, `DOType`, `DAType` or `EnumType` that nothing in the document names goes, then the types it alone named: the `DOType`s of its data objects, their `DAType`s, their `EnumType`s. A type is named by the `lnType` of an `LN`, `LN0` or `LNode` (bound to an IED or not), the `type` of a `DO` or `SDO`, the `type` of a `DA` or `BDA` whatever its `bType`. Every record inside a removed type goes with it, a `Private` and the content of a tool included. A cycle of types naming each other (two `DOType`s whose `SDO` name one another) stays.

```ts
pruneUnusedTypes(): Promise<void>
```

It judges every type of the document, deleted through the transaction (the delete hooks run): use it to tidy a document that holds types nothing names, a file as it was imported. An import keeps a file as written, and so does an extract: neither calls it.

What a transaction leaves unused goes at its commit, with no call — a delete of the last element naming a type, a `lnType` or `type` changed to another value, `tx.lifecycle.apply`, any plain edit. Only a type that **lost a referrer in this transaction** is judged, on the document as the transaction leaves it:

- a type nothing named before the transaction stays, and keeps what it names;
- a type the transaction created stays, named or not;
- a type whose last referrer is deleted and another created naming it in the same transaction stays, as does a name changed away and back.

A replace in two transactions (delete the element naming a type, create another naming it later) therefore names a type that is gone: create the new element first, or in the same transaction. A type deleted by hand does not make the elements naming it dangle any less: they keep their `lnType` / `type`, and the types only it named go.

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
