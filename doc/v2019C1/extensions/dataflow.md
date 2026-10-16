---
description: 'Dataflow extension for @dialecte/scl v2019C1 -- what each signal of the specification describes, what implements it (ExtRef, ExtCtrl, control block, registration), between which IEDs, and how to link or unlink it.'
---

# Dataflow

The `dataflow` extension reads the data exchanged between logical nodes. A dataflow is a specified signal (a `SourceRef` taking data from another logical node, a `ControlRef` controlling data of one) and what implements it: the `ExtRef` / `ExtCtrl` it names, the control block publishing the signal, the subscriber's registration on it. An `ExtRef` implemented without any signal is a dataflow too.

## Query methods

Access via `doc.query.dataflow`. Every method reads the process section (function templates included) and the IED section once per call.

### `ofSourceRef` / `ofControlRef`

```ts
const dataflow = await doc.query.dataflow.ofSourceRef({ ref: { tagName: 'SourceRef', id } })
const output = await doc.query.dataflow.ofControlRef({ ref: { tagName: 'ControlRef', id } })
// SpecifiedDataflow
```

The dataflow one signal describes: what it specifies, then what implements it. The signal must be held by an `LNode` of the process section, otherwise the call is refused with `ELEMENT_NOT_FOUND`. A `SourceRef` is an input of its `LNode` (`direction: 'input'`), a `ControlRef` an output.

### `all`

```ts
const dataflows = await doc.query.dataflow.all()
// Dataflow[]
```

Every dataflow of the document, templates included: one `specified` entry per signal in document order (signals sharing an `ExtRef` stay separate), then one `implementation-only` entry per `ExtRef` naming a control block that no signal links to, in document order. An `ExtRef` of the same signal and control block as one a signal links to, in the same logical node, gets no entry of its own: the record does not list it (the `ExtRef`s of the data attributes of one data object).

### `ofIed`

```ts
const { published, subscribed } = await doc.query.dataflow.ofIed({ ref: { tagName: 'IED', id } })
// { published: Dataflow[]; subscribed: Dataflow[] }
```

What an IED subscribes to and publishes, see [The two sides](#the-two-sides). A dataflow inside the IED is in both lists. In the order of `all`.

### `crossing`

```ts
const crossing = await doc.query.dataflow.crossing({ ieds: [bay1Ied, bay2Ied] })
// Dataflow[]
```

The dataflows with exactly one of their two sides inside the set of IEDs, in the order of `all`. A dataflow between two IEDs of the set, or between two IEDs outside it, does not cross it; a side that is not known counts as outside.

### `subscribersOf`

```ts
const { registrations, elements, dataflows } = await doc.query.dataflow.subscribersOf({
	controlBlock: { tagName: 'GSEControl', id },
})
// ControlBlockSubscribers
```

What subscribes to a control block (`GSEControl`, `SampledValueControl` or `ReportControl`):

| Field           | Content                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `registrations` | the `IEDName` and `ClientLN` it holds, each a `Registration` with how precisely it names its subscriber |
| `elements`      | the `ExtRef`s naming it, by uuid or by names                                                            |
| `dataflows`     | the dataflows of those `ExtRef`s, specified or not                                                      |

A reference that is not a control block of an IED of the document is refused with `ELEMENT_NOT_FOUND`.

## The dataflow record

A `Dataflow` is a `SpecifiedDataflow` or an `ImplementationOnlyDataflow`, told apart by `kind`.

### `SpecifiedDataflow`

| Field                         | Content                                                                                                                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`                        | `'specified'`                                                                                                                                                                                                                     |
| `signal`                      | the `SourceRef` / `ControlRef`                                                                                                                                                                                                    |
| `direction`                   | `'input'` for a `SourceRef`, `'output'` for a `ControlRef`                                                                                                                                                                        |
| `specification.state`         | `'connected'` once the other logical node is named, by path or by uuid, else `'open'`                                                                                                                                             |
| `specification.service`       | the service the signal asks for, as written; an output has none                                                                                                                                                                   |
| `specification.holder`        | the `LNode` holding the signal: the subscriber of an input, the controller of an output                                                                                                                                           |
| `specification.other`         | `{ lnode, doName?, daName? }`: the other `LNode` and the data it provides; `undefined` while none is named, or it names nothing                                                                                                   |
| `specification.allocation`    | `'same-ied'`, `'inter-ied'`, or `'unallocated'` when one of the two `LNode`s is mapped to no logical node of the document, or when the signal names no other `LNode` or one the document lacks (every open signal is unallocated) |
| `specification.mappedIeds`    | `{ holder, other }`: the IED each `LNode` is mapped into (what `allocation` is read from); `undefined` for one that is not mapped                                                                                                 |
| `implementation.state`        | `'implemented'` once the signal names its `ExtRef` / `ExtCtrl`, else `'unimplemented'`                                                                                                                                            |
| `implementation.element`      | the `ExtRef` / `ExtCtrl` it names; `undefined` while none is named, or it names nothing                                                                                                                                           |
| `implementation.binding`      | how completely that element is written (`ExtRefState` / `ExtCtrlState`); `undefined` without an element                                                                                                                           |
| `implementation.ln`           | the logical node holding the element                                                                                                                                                                                              |
| `implementation.ied`          | the IED holding the element: the subscriber of an input, the controller of an output                                                                                                                                              |
| `implementation.controlBlock` | the control block the `ExtRef` names                                                                                                                                                                                              |
| `implementation.publisher`    | the IED holding that control block                                                                                                                                                                                                |
| `implementation.registration` | the subscriber's own entry on that control block, when it has one                                                                                                                                                                 |
| `implementation.dangling`     | the `DanglingLink`s of the signal and of its element, see [How things are found](#how-things-are-found)                                                                                                                           |

The data of `other`: `doName` / `daName` come from the signal's own data attributes when written, else from the qualifier its path carries (a `SourceRef` reads `DO.DA` as the data object up to the first dot and the rest as the data attribute, a `ControlRef` reads the whole qualifier as the data object). They are absent when the signal gives none.

`allocation` is read from where the two `LNode`s are mapped, never from the service.

### `ImplementationOnlyDataflow`

An `ExtRef` naming a control block that no signal links to.

| Field            | Content                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `kind`           | `'implementation-only'`                                                                                          |
| `element`        | the `ExtRef`                                                                                                     |
| `implementation` | like the `implementation` of a `SpecifiedDataflow`, with `state` always `'implemented'` and `binding` always set |

## States

**Specification.** `open` until the signal names the other logical node, `connected` once it does (the same as `info.of` gives a signal).

**Implementation.** `unimplemented` until the signal names its `ExtRef` / `ExtCtrl` (`extRefUuid` / `extRefAddr`, `extCtrlUuid` / `extCtrlAddr`), `implemented` once it does. Whether it is implemented never depends on the control block: the control block, its publisher and the registration are facts beside it. A name that finds nothing is still a name: the dataflow is `implemented`, with no `element` and a `dangling` entry.

**Binding.** How completely the `ExtRef` / `ExtCtrl` itself is written, the same value `info.of` gives the element, `empty · later-binding · expected · subscribed · bound` for an `ExtRef` (an `ExtCtrl` has no `subscribed`). The rule for each is in [Info: State](./info#state).

## How things are found

Every link of a dataflow is found the same way: **the uuid wins**, then the names or the address.

- **The other logical node.** The `LNode` named by `sourceLNodeUuid` / `controlledLNodeUuid`, else the one named by `source` / `controlled` (when several `LNode`s share that path, the last one, as the import does).
- **The `ExtRef` / `ExtCtrl`.** The one named by `extRefUuid` / `extCtrlUuid`, else the one `extRefAddr` / `extCtrlAddr` addresses. The address is read in every written form, relative to the signal's `LNode`: the full path `IED/LD/LN.intAddr`, the path inside its IED `LD/LN.intAddr`, and the `intAddr` alone (marked `@intAddr` or not), each tried in turn. When an address fits several `ExtRef`s (they share an `intAddr` and differ by their data attribute), the one carrying the signal's `pDA` is taken; with none to tell them apart the address gives no element.
- **The signal an `ExtRef` / `ExtCtrl` names.** Its logical node by uuid (`lnUuid`), else by its `iedName`, `ldInst` and `lnClass` (`prefix` and `lnInst` may be left out); `iedName="@"` is the IED holding the element.
- **The control block.** The one named by `srcCBUuid`, else the one its names name (`iedName`, `srcLDInst`, `srcCBName`; the logical device is the one of the data subscribed to when left out), the `serviceType` telling the kind. Names fitting several control blocks of different kinds give none.
- **The registration.** The `IEDName` or `ClientLN` of the control block naming the subscriber (the IED holding the `ExtRef`), by the uuids it carries, else by its names. It tells how precisely it names it:

  | `names` | The registration names                                                |
  | ------- | --------------------------------------------------------------------- |
  | `ln`    | the subscriber's logical node                                         |
  | `ld`    | its logical device                                                    |
  | `ap`    | an access point of its IED: the least precise, it always names an IED |

  When several registrations name the subscriber, the most precise is taken. `apRef` is not a key: it does not tell subscribers apart (except for a client logical node held directly by an access point), and an `apUuid` matches any access point of that IED, not necessarily the one holding the `ExtRef`.

**Dangling.** A `DanglingLink` is `{ element, attribute, value }`: a uuid or an address that names nothing in the document, the attribute holding it, on which element. It covers the signal's link to the other logical node, its link to its `ExtRef` / `ExtCtrl` (the uuid when written, else the address), its `resourceUuid`, and the `lnUuid` and `srcCBUuid` of the element. An attribute that is not written is not dangling, it is not a link. An address fitting several elements without telling them apart is not dangling either: it names several things.

## The two sides

A dataflow runs between two IEDs, its sides:

| Side   | The IED                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `near` | holding the `ExtRef` / `ExtCtrl`, else the IED the holder `LNode` is mapped to                                                             |
| `far`  | holding the control block it names, else the IED its element names as the owner of its signal, else the IED the other `LNode` is mapped to |

- `ofIed` lists in `subscribed` the dataflows whose near side is the IED, and in `published` those whose far side is. A dataflow no element implements yet is seen through the IEDs its two `LNode`s are mapped to.
- `crossing` lists the dataflows with exactly one side inside a set of IEDs, so a dataflow between two IEDs that is not implemented yet is listed too.

## Transaction methods

Access via `tx.dataflow`.

### `link`

```ts
await doc.transaction(async (tx) => {
	await tx.dataflow.link({ signal: sourceRef, implementation: extRef })
})
```

Links a signal to the element implementing it: a `SourceRef` to its `ExtRef`, a `ControlRef` to its `ExtCtrl`. The signal names the element by its uuid (`extRefUuid` / `extCtrlUuid`) and the address is written from it. Whatever address the signal held is removed with the write, so one that cannot be composed (an element without `intAddr`) does not stay. The `ExtRef` / `ExtCtrl` is not touched.

The address (`extRefAddr` / `extCtrlAddr`) is written in the form the element's place gives, relative to the signal's `LNode`:

| The element sits                                                                                                          | Written                           | Example             |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------- |
| in the logical node the `LNode` is mapped to                                                                              | the bare `intAddr`                | `Trip`              |
| in another logical node of the same IED                                                                                   | `LD/LN.intAddr`                   | `LD0/GGIO1.Trip`    |
| anywhere else: the `LNode` is mapped to no IED or to another one, or the logical node is held directly by an access point | the full path `IED/LD/LN.intAddr` | `B1/LD0/XCBR1.Trip` |
| without an `intAddr`                                                                                                      | none                              |                     |

The logical node the `LNode` is mapped to is read from its naming attributes (`iedName`, `ldInst`, `prefix`, `lnClass`, `lnInst`), which setting its `lnUuid` writes; an `LNode` bound by `lnUuid` does not yet have them follow a rename of the logical device or IED of its logical node, so after such a rename the address is written in the `LD/LN.intAddr` or the full form.

The address then follows the renames of the element's own logical device and IED, and the mapping of the `LNode`: mapping, remapping or unmapping it rewrites the addresses of its signals (and removes one that can no longer be written).

Refused, nothing written:

| Key                             | Code      | When                                                                                                                       | `meta`                                                       |
| ------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `DATAFLOW_LINK_TARGET_MISMATCH` | `SCL3001` | the signal cannot be implemented by an element of that kind (a `SourceRef` to an `ExtCtrl`, a `ControlRef` to an `ExtRef`) | `signal: { tagName, id }`, `implementation: { tagName, id }` |
| `ASSERTION_FAILED`              | -         | the element has no `uuid` to name it by                                                                                    | -                                                            |
| `ASSERTION_FAILED`              | -         | the element is not held by an IED                                                                                          | -                                                            |

`DATAFLOW_LINK_TARGET_MISMATCH` is in `SCL_ERRORS` (see [Errors and warnings](../api/errors)); `ASSERTION_FAILED` is a key of the core catalogue, an element that cannot be linked rather than a choice the consumer made.

### `unlink`

```ts
await doc.transaction(async (tx) => {
	await tx.dataflow.unlink({ signal: sourceRef })
})
```

Unlinks a signal from the element implementing it: its uuid (`extRefUuid` / `extCtrlUuid`) and its address (`extRefAddr` / `extCtrlAddr`) are removed. The signal keeps what it specifies, and the `ExtRef` / `ExtCtrl` is not touched.

## Exported types

Exported from `@dialecte/scl/v2019C1`; the runtime extension object is not.

| Type                                                          | Content                                                                            |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Dataflow`, `SpecifiedDataflow`, `ImplementationOnlyDataflow` | the record                                                                         |
| `ExtRefState`, `ExtCtrlState`                                 | the `binding` values, and the `state` of an `ExtRef` / `ExtCtrl` in `info.of`      |
| `Registration`                                                | `{ element: Ref<'IEDName' \| 'ClientLN'>; names: 'ap' \| 'ld' \| 'ln' }`           |
| `DanglingLink`                                                | `{ element, attribute, value }`                                                    |
| `IedDataflows`                                                | `{ published, subscribed }`                                                        |
| `ControlBlockSubscribers`                                     | `{ registrations, elements, dataflows }`                                           |
| `LinkParams`, `UnlinkParams`                                  | the parameters of `link` and `unlink`                                              |
| `LinkedElement`, `LinkTargetMismatchMeta`                     | an element as an error names it, and the `meta` of `DATAFLOW_LINK_TARGET_MISMATCH` |
