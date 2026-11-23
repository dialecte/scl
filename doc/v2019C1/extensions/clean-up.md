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
| `commitPrune`          | List, without writing, what the commit of the transaction will prune                                    |

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
- a transparent wrapper of the dialecte's own elements: a `Private` whose `type` is the prefix of a namespace the dialecte declares (`eIEC61850-6-100`);
- a `DataSet`, which the schema refuses without an entry: the control blocks sending it (a log control too) lose their `datSet` and, those keeping one, their `confRev` rises (once in a transaction), as when a `DataSet` is deleted.
- a `SubNetwork`, which the schema refuses without a connected access point: the delete of the only IED or access point connected to it takes it too, and `pruneEmptyContainers` removes one holding none.

Its parent is then judged the same way: the wrapper a category leaves empty goes too. An element of its own that needs a child (an `IED`, an `LNodeType`, an `Application`) is the project's to remove; a `Private` of another `type` is a tool's private data, kept empty or not; a level of the topology (`Substation`, `VoltageLevel`, `Bay`) is never removed.

```ts
pruneEmptyContainers(): Promise<void>
```

It judges every container of the document, deleted through the transaction (the delete hooks clean what refers to it): the extract clean-up runs it on the file it writes, whose containers may have been empty already.

A transaction also empties a container that loses every child of a kind its content model requires there and keeps nothing with an identity of its own: a `Server` its last `LDevice` (its `Authentication` goes with it), a `DataSet` its last `FCDA` (its `Private` goes with it); one branch of a required choice staying keeps it (an `SMVSettings` keeping its `SmpRate`). One judge decides for the delete cascade, the commit and `pruneEmptyContainers`, which, judging no removal, removes a container only when it holds nothing.

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

## `commitPrune`

What the commit of this transaction will prune, before it does, without writing anything: the commit's own steps run
over the operations staged so far. A tool can warn before a commit removes a container, then commit or discard.

```ts
let preview: CommitPrune | undefined
const prepared = await doc.prepare(async (tx) => {
	await tx.delete({ tagName: 'ConnectedAP', id: connectedApId })
	preview = await tx.cleanUp.commitPrune()
})
if (preview && preview.containers.length > 0 && !(await confirmed(preview))) prepared.discard()
else await prepared.commit()
```

`tx.cleanUp.commitPrune` returns `{ stagedCount, containers, types, moves, released }`:

- `containers`: each container the commit removes, in document order:
  - `element`, `identity` (`name`, `uuid`, `type` where its tag has them), `parent` (with its `name`);
  - `owner`: the nearest element at or above it that a reference path names, with that path (`S1/V1/B1` for a
    bay's `Labels`, `IED1/LD1/LLN0` for a data set); absent when none is named (a `SubNetwork`);
  - `reason`: `emptied` (`holds-nothing`, or `lost-required` with the group of children it lost) or `above` (a container
    removed below it left it empty);
  - `holds`: every record it takes with it, its subtree in document order, another tool's data included (its `Private`
    and that data's own elements); each record names its `parent`; a container listed below it keeps its own records;
  - `goesWith`: what its removal does outside it, one entry per element, each with that element's `identity` (its
    `name`, `uuid` and `type` where its tag has them) and the `effect` the commit has on it. Every reference the
    prune removes beyond the container is listed under the container that caused it to go — a `FunctionCategoryRef`
    naming a pruned `FunctionCategory`, a `VariableRef` naming a pruned `Variable` (`deleted`), a reference that
    keeps its own content with the names of what went cleared from it (`cleared`); a record such a reference held
    goes with it and is not listed on its own. A data set's control blocks lose their `datSet` (`cleared`) and the
    commit raises their revision (`revised`; a block the transaction already raised is not raised again).
- `types`: each data type the commit removes as unused, with the records it holds. A `DataTypeTemplates` they leave
  empty is listed under `containers`, holding none of them.
- `moves`: each element the commit's moves remove, with its `identity`, the `effect` (`deleted`, or `cleared` of the
  names it can no longer reach) and the `reason`: `out-of-reach` (a reference whose target its new place cannot
  name) or `terminal-across-containers` (a terminal left naming a node its container may not name). What goes with
  either of them — a container left holding nothing, a reference naming that container — carries the reason of the
  removal it followed; a record a removed element holds goes with it and is not listed on its own.
- `released`: each `LNode` the commit released from a logical node the transaction deleted, with its `identity` and
  the binding it had (`from`) and is left with (`to`): `iedName`, `ldInst`, `prefix`, `lnClass`, `lnInst` and
  `lnUuid`, each where the LNode names it.
- `stagedCount`: the number of staged operations the preview read.

Together they name every record the commit removes beyond the transaction's own edits, each once: a record a
container or a type holds is listed under it, not on its own, and nothing the commit keeps is listed.

A preview holds only for the staged state it read: a write staged after it is not in it. Call it last, after every
write. A container the transaction deletes itself is not listed: it is a delete, not a prune. A transaction the commit
refuses throws the same error (a move the commit does not follow: `MOVE_NOT_FOLLOWED`). The ids of records the commit
creates (a `Private` wrapping an element of the extension namespace, on a move or a create) are not part of the
preview; the ids of the containers it prunes are stable.

## `resetLNode`

An `LNode` bound to an IED names the logical node that implements it, and that logical node must be in the document.

```ts
resetLNode(params?: { elements?: Scl.Ref<Scl.ElementsOf>[] }): Promise<void>
```

Without `elements`, every `LNode`, `DOS` / `SDS` / `DAS` and `SourceRef` / `ControlRef` of the document; with them, only those among the elements given (others are left aside). For each:

- assigned to no IED → `iedName="None"` is written when absent or empty;
- bound, its logical node in the document → left as it is. With an `lnUuid`, only the logical node carrying that uuid counts; without one, the logical node its naming (`iedName` / `ldInst` / `prefix` / `lnClass` / `lnInst`) names;
- bound, its logical node absent → back to its specification, from its `LNodeSpecNaming`, which keeps its values. Specified on a specification IED (an IED with no ICD or IID among its source files) holding the logical node its specified naming names, no other LNode bound to that logical node, and not bound to that IED itself: bound to that logical node (`iedName` / `ldInst` / `prefix` / `lnClass` / `lnInst` from the specified naming, `lnUuid` that logical node's uuid). Otherwise assigned to no IED: `iedName="None"`, `lnUuid` removed, `ldInst` / `prefix` / `lnClass` / `lnInst` from its `LNodeSpecNaming` (without one, `ldInst` is removed and the rest kept). Nothing in a device is removed (unlike [`dataModel.unlockLNode`](./data-model#unlocklnode), which removes the values the system tool owns);
- bound or not, its `DOS` / `SDS` / `DAS` mapped to a logical node, its `SourceRef` / `ControlRef` naming an `ExtRef` / `ExtCtrl`, the document does not hold → that name (uuid and path) is removed, the element stays. An `LNode` implemented by several logical nodes, or sharing one, is assigned to no IED and names them there.

`templateUuid` is never touched. The extract clean-up runs it on the whole document; `tx.lifecycle.apply` runs it on the elements it wrote.

A logical node deleted in a transaction (an `LN` / `LN0`, or an `LDevice`, access point or IED holding it) releases, at the commit, the LNodes bound to it by the same rule: back to the logical node of the specification IED they are specified on when the document still holds it after the transaction, else on no IED; the addresses of their signals are written again from where they stand. A logical node deleted and created again in the same transaction keeps its LNodes bound: by `lnUuid` when that uuid comes back, wherever it sits; by names when a logical node of that address comes back. No caller needs to run `resetLNode` after a delete for the LNodes; it is still what releases a binding the document held already, or a data or signal name naming something absent.
