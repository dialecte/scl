---
description: 'Dataflow extension for @dialecte/scl v2019C1 -- what each signal of the specification describes, what implements it (ExtRef, ExtCtrl, control block, registration), between which IEDs, and how to link, unlink or unsubscribe it.'
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

The dataflows with exactly one of their two sides inside the set of IEDs, in the order of `all`. A dataflow between two IEDs of the set, or between two IEDs outside it, does not cross it; a side the set does not hold - an IED the document lacks included - is outside.

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

### `companionsOf`

```ts
const companions = await doc.query.dataflow.companionsOf({
	extRef: { tagName: 'ExtRef', id },
})
// Ref<'ExtRef'>[]
```

The other `ExtRef`s implementing the same data object signal as the one given (its `stVal` and `q` companions): in the
same logical node, naming the same publisher logical node, data object and control block (each resolved, by uuid or by
names), and linked to no other signal, in document order. None while the `ExtRef` names no control block or no publisher
logical node. An `ExtRef` that is not an input of an IED is refused with `ELEMENT_NOT_FOUND`.

### `supervisionsOf`

```ts
const supervisions = await doc.query.dataflow.supervisionsOf({
	requests: [
		{ controlBlock: { tagName: 'GSEControl', id }, subscriber: { tagName: 'IED', id: iedId } },
	],
})
// (Supervision | undefined)[], one per request, in order
```

The supervision of each control block (`GSEControl`, `SampledValueControl`) in each subscriber IED asked, as `implementation.supervision` gives it for a dataflow; `undefined` for a control block or IED the document lacks, or one not supervised. It reads the supervision once per call, whatever the number of requests. It is also on the transaction, `tx.dataflow.supervisionsOf`, where it reads the staged state.

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
| `specification.other`         | `{ lnode, doName?, daName?, dataPath? }`: the other `LNode` and the data it provides; `undefined` while none is named, or it names nothing                                                                                        |
| `specification.allocation`    | `'same-ied'`, `'inter-ied'`, or `'unallocated'` when one of the two `LNode`s is mapped to no logical node of the document, or when the signal names no other `LNode` or one the document lacks (every open signal is unallocated) |
| `specification.mappedIeds`    | `{ holder, other }`: the IED each `LNode` is mapped into (what `allocation` is read from); `undefined` for one that is not mapped                                                                                                 |
| `implementation.state`        | `'implemented'` once the signal names its `ExtRef` / `ExtCtrl`, else `'unimplemented'`                                                                                                                                            |
| `implementation.element`      | the `ExtRef` / `ExtCtrl` it names; `undefined` while none is named, or it names nothing                                                                                                                                           |
| `implementation.binding`      | the shape that element is written in (`ExtRefState` / `ExtCtrlState`); `undefined` without an element, or when it is written in none of the documented shapes                                                                     |
| `implementation.ln`           | the logical node holding the element                                                                                                                                                                                              |
| `implementation.ied`          | the IED holding the element: the subscriber of an input, the controller of an output                                                                                                                                              |
| `implementation.controlBlock` | the control block the `ExtRef` names                                                                                                                                                                                              |
| `implementation.publisher`    | the IED holding that control block                                                                                                                                                                                                |
| `implementation.registration` | the subscriber's own entry on that control block, when it has one                                                                                                                                                                 |
| `implementation.supervision`  | the LGOS / LSVS of the subscriber supervising that control block, when one does (absent otherwise), see [How things are found](#how-things-are-found)                                                                             |
| `implementation.dangling`     | the `DanglingLink`s of the signal and of its element, see [How things are found](#how-things-are-found)                                                                                                                           |

The data of `other`: `doName` / `daName` come from the signal's own data attributes when written. Else they come from the qualifier its path carries (`PhV.phsA.cVal.mag.f`), split against the data model of the logical node type the `LNode` names (`lnType`): the data object is a data object then its sub data objects (`PhV.phsA`), the data attribute a data attribute then its nested ones (`cVal.mag.f`), never a cut at the first dot. A `ControlRef` carries a data object only. The split is never guessed: when the data model cannot be followed (the `LNode` names no type, the document lacks the type or a name below it) `doName` and `daName` are absent. `dataPath` is that qualifier as written, set whenever the data comes from the path, split or not; it is absent when the signal's own data attributes gave the data, or when the signal gives none.

`allocation` is read from where the two `LNode`s are mapped, never from the service.

### `ImplementationOnlyDataflow`

An `ExtRef` naming a control block that no signal links to.

| Field            | Content                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`           | `'implementation-only'`                                                                                                                                                    |
| `element`        | the `ExtRef`                                                                                                                                                               |
| `implementation` | like the `implementation` of a `SpecifiedDataflow`, with `state` always `'implemented'`; `binding` is absent when the `ExtRef` is written in none of the documented shapes |

## States

**Specification.** `open` until the signal names the other logical node, `connected` once it does (the same as `info.of` gives a signal with `withState: true`).

**Implementation.** `unimplemented` until the signal names its `ExtRef` / `ExtCtrl` (`extRefUuid` / `extRefAddr`, `extCtrlUuid` / `extCtrlAddr`), `implemented` once it does. Whether it is implemented never depends on the control block: the control block, its publisher and the registration are facts beside it. A name that finds nothing is still a name: the dataflow is `implemented`, with no `element` and a `dangling` entry.

**Binding.** The shape the `ExtRef` / `ExtCtrl` itself is written in, the same value `info.of` gives the element with `withState: true`: `later-binding · expected · subscribed · bound` for an `ExtRef`, `later-binding · bound` for an `ExtCtrl`; `undefined` when it is written in none of them. `later-binding` is the internal address with, for an `ExtRef`, the expected data object (`pDO`), nothing of a signal or a control block, and no service but the one it expects: a `serviceType` equal to its `pServT`, the form an ISD writes its inputs in (an `ExtCtrl`'s `pDO` is optional). The rule for each is in [Info: State](./info#state).

## How things are found

Every link of a dataflow is found the same way: **the uuid wins**, then the names or the address.

- **The other logical node.** The `LNode` named by `sourceLNodeUuid` / `controlledLNodeUuid`, else the one named by `source` / `controlled` (when several `LNode`s share that path, the last one, as the import does).
- **The `ExtRef` / `ExtCtrl`.** The one named by `extRefUuid` / `extCtrlUuid`, else the one `extRefAddr` / `extCtrlAddr` addresses. The address is read in every written form, relative to the signal's `LNode`: the full path `IED/LD/LN.intAddr`, the path inside its IED `LD/LN.intAddr`, and the `intAddr` alone (marked `@intAddr` or not), each tried in turn. When an address fits several `ExtRef`s (they share an `intAddr` and differ by their data attribute), the one carrying the signal's `pDA` is taken; with none to tell them apart the address gives no element.
- **The signal an `ExtRef` / `ExtCtrl` names.** Its logical node by uuid (`lnUuid`), else by its `iedName`, `ldInst` and `lnClass` (`prefix` and `lnInst` may be left out); `iedName="@"` is the IED holding the element.
- **The control block.** The one named by `srcCBUuid`, else the one its names name (`iedName`, `srcLDInst`, `srcCBName`; the logical device is the one of the data subscribed to when left out), the `serviceType` telling the kind (`Poll` names none). Names fitting several control blocks of different kinds give none.
- **The registration.** The `IEDName` or `ClientLN` of the control block naming the subscriber (the IED holding the `ExtRef`), by the uuids it carries, else by its names. It tells how precisely it names it:

  | `names` | The registration names                                                |
  | ------- | --------------------------------------------------------------------- |
  | `ln`    | the subscriber's logical node                                         |
  | `ld`    | its logical device                                                    |
  | `ap`    | an access point of its IED: the least precise, it always names an IED |

  When several registrations name the subscriber, the most precise is taken. `apRef` names an access point of the IED the registration names; it is a matching key only for a client logical node held directly by an access point, and an `apUuid` matches any access point of that IED, not necessarily the one holding the `ExtRef`.

- **The supervision.** In the IED holding the `ExtRef`, the first `LN` (in document order, those of an access point without server included) of class `LGOS` for a `GSEControl`, `LSVS` for a `SampledValueControl`, whose `GoCBRef` / `SvCBRef` holds a `setSrcRef` value naming the control block the dataflow found. A value names it in any form a reference takes inside SCL: `<ldName>/LLN0.<name>` when its logical device has an `ldName`, `<IED name><inst>/LLN0.<name>` (also beside an `ldName`), `@<inst>/LLN0.<name>` when the control block is in that same IED, and `#UID<uuid>` of the control block, `#UID<uuid>/LLN0.<name>` of its logical device or `#UID<uuid>.<name>` of its `LN0`. The control block's own kind tells the class, whatever the `ExtRef`'s `serviceType`; a report control block has none.

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

The logical node the `LNode` is mapped to is read from its naming attributes (`iedName`, `ldInst`, `prefix`, `lnClass`, `lnInst`), which setting its `lnUuid` writes; they follow a rename of that logical node, of its logical device and of its IED, so an element in the logical node the `LNode` is mapped to keeps the bare `intAddr` after such a rename.

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

### `unsubscribe`

```ts
const ended = await doc.transaction((tx) =>
	tx.dataflow.unsubscribe({
		extRefs: [{ tagName: 'ExtRef', id }],
		cleanup: 'unused-data',
	}),
)
// UnsubscribeResult
```

Ends the subscriptions of `ExtRef`s, with their companions (see `companionsOf`) unless `withCompanions: false`, in one
transaction:

- **The input.** An `ExtRef` holding an internal address (`intAddr`) is kept, its binding cleared: the data and control
  block it names and its `serviceType`; its `intAddr`, `desc`, expected data (`pXxx`) and `uuid` stay. One without an
  internal address is removed. It is the delete cascade's rule, shared.
- **The signal.** A `SourceRef` linked to a kept `ExtRef` is unlinked (as `unlink` does); one linked to a removed `ExtRef`
  loses its link with it.
- **The registrations.** Per control block and subscriber IED, once none of the subscriber's `ExtRef`s names the control
  block any more, its registrations go: on a GOOSE or sampled value control block every `IEDName` naming that IED (a
  subscriber is its IED); on a report control block each `ClientLN` naming where an ending `ExtRef` sits, its logical
  node, logical device or access point (a client is a logical node: one with no `ExtRef`, such as an HMI, stays). While
  some still name it, an `IEDName` naming only a logical device or logical node none of them is in goes when another
  registration already names each remaining `ExtRef`, else one such is cleared to the IED (and any further one goes), so
  the subscriber is never registered twice at the IED. A `ClientLN` naming a logical node none of them sits in goes
  as well; it is never cleared to its IED. A `ClientLN` is kept,
  listed in `kept`, when it is a client of a buffered report control block (`buffered-preconfigured`: it may be a
  preconfigured client), or of an indexed one with a client after it that stays (`indexed-position`: its position is the
  instance number of the clients after it); the last clients go.
- **The supervision.** Once the subscriber's `ExtRef`s no longer name a GOOSE or sampled value control block, the
  `setSrcRef` value naming it in the subscriber's LGOS / LSVS is cleared (its `Val` removed); the logical node stays.
  The same bookkeeping runs at commit for inputs ended or control blocks deleted by any transaction, not only for
  `unsubscribe`. Bookkeeping already staged by the verb or the delete cascade is not written twice.
- **Engineering rights.** An IED whose `engRight` is `fix` is never written: when it holds a given `ExtRef`, the call is refused with `DATAFLOW_UNSUBSCRIBE_REFUSED` (`meta: { reason: 'eng-right-fix', ied }`) and
  nothing is written; when it is the publisher, its registrations are kept, listed with `eng-right-fix`.
- **Publisher data.** The default `cleanup: 'subscriptions'` leaves data sets, entries and control blocks alone.
  `unused-data` removes `FCDA`s no remaining subscriber of a sending control block reads, then data sets made empty, then
  control blocks left with no registration, bound `ExtRef` or data set. Data-set modification uses `ConfDataSet`; block
  deletion uses `GSESettings`, `SMVSettings` or `ReportSettings`. A fixed, non-modifiable, engineering-right-restricted
  or still-used element stays and is listed in `kept`. Deleting a GOOSE or sampled-value block also removes its
  communication entry through the normal delete cascade.
- **Configuration revision.** Every surviving report, GOOSE or sampled-value control block whose data-set structure or
  reference changes rises once by 10,000. Invalid counters and counters that would overflow stay unchanged.

| Field           | Content                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `unbound`       | the `ExtRef`s kept, their binding cleared                                                       |
| `removed`       | the `ExtRef`s removed (no internal address)                                                     |
| `unlinked`      | the `SourceRef`s no longer linked                                                               |
| `registrations` | each `IEDName` / `ClientLN` removed (`deleted`) or cleared to its IED (`cleared`, `attributes`) |
| `supervisions`  | the `setSrcRef` `DAI`s whose value was cleared                                                  |
| `kept`          | kept registrations and publisher data, with their registration or cleanup reason                |
| `fcdas`         | the data-set entries removed by `unused-data` cleanup                                           |
| `dataSets`      | the empty data sets removed by `unused-data` cleanup                                            |
| `controlBlocks` | the unused control blocks removed by `unused-data` cleanup                                      |
| `confRevs`      | each changed control block's revision, as `{ controlBlock, from, to }`                          |

A reference that is not an input of an IED is refused with `ELEMENT_NOT_FOUND`.

A `ClientLN` kept for its position is not removed by a later unsubscribe that leaves it last. Only the first
supervision (in document order) naming the control block in the subscriber is cleared.

## Exported types

Exported from `@dialecte/scl/v2019C1`; the runtime extension object is not.

| Type                                                                  | Content                                                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Dataflow`, `SpecifiedDataflow`, `ImplementationOnlyDataflow`         | the record                                                                         |
| `ExtRefState`, `ExtCtrlState`                                         | the `binding` values, and the `state` of an `ExtRef` / `ExtCtrl` in `info.of`      |
| `Registration`                                                        | `{ element: Ref<'IEDName' \| 'ClientLN'>; names: 'ap' \| 'ld' \| 'ln' }`           |
| `DanglingLink`                                                        | `{ element, attribute, value }`                                                    |
| `IedDataflows`                                                        | `{ published, subscribed }`                                                        |
| `ControlBlockSubscribers`                                             | `{ registrations, elements, dataflows }`                                           |
| `Supervision`, `SupervisionRequest`                                   | `{ ln, doi, dai, val }`, and a request of `supervisionsOf`                         |
| `LinkParams`, `UnlinkParams`                                          | the parameters of `link` and `unlink`                                              |
| `LinkedElement`, `LinkTargetMismatchMeta`                             | an element as an error names it, and the `meta` of `DATAFLOW_LINK_TARGET_MISMATCH` |
| `CompanionsOfParams`                                                  | the parameters of `companionsOf`                                                   |
| `UnsubscribeParams`, `UnsubscribeResult`                              | the parameters and result of `unsubscribe`                                         |
| `RegistrationOperation`, `KeptRegistration`, `KeptRegistrationReason` | a registration removed or cleared, and one kept with why                           |
| `KeptCleanup`, `KeptCleanupReason`                                    | publisher data kept by cleanup, with why                                           |
| `UnsubscribeRefusalMeta`                                              | the `meta` of `DATAFLOW_UNSUBSCRIBE_REFUSED`                                       |
