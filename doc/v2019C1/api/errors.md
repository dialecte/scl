---
title: Errors and warnings
description: The codes the SCL dialecte raises and reports, their default wording and the data each carries
---

# Errors and warnings

Everything the dialecte raises or reports is identified by a **code**, comes with a **default wording**, and says what it is about as **data**. The wording shown to a user is the consumer's: map the code to your own sentence, fill it from the data, and fall back to the default wording for a code you do not know. Nothing has to be read out of a message.

## Errors

An error is a structured [`DialecteError`](https://dialecte.github.io/core/guide/development/state-and-errors): `key` and `code` identify the situation, `message` is the default wording, `meta` is the data, `detail` is for developers. It reaches the caller unchanged, also when it was thrown inside `doc.transaction` or `doc.prepare`.

```ts
import { toDialecteError } from '@dialecte/core'
import { SCL_ERRORS } from '@dialecte/scl/v2019C1'

try {
	await doc.prepare((tx) => tx.lifecycle.apply({ ...target, report, resolution }))
} catch (thrown) {
	const error = toDialecteError(thrown)
	if (error?.key === SCL_ERRORS.MAPPING_UNDECIDED.key) {
		// error.meta: { sourceId, tagName, kind } — point the user at that row
	}
}
```

To word every error from a table of your own, narrow its `key` first: `isKnownDialecteError` checks the key and the code against the core catalogue and the catalogues you name, so the table lookup is type-checked.

```ts
import { isKnownDialecteError, toDialecteError } from '@dialecte/core'
import { SCL_ERRORS } from '@dialecte/scl/v2019C1'

const error = toDialecteError(thrown)
const sentence =
	error && isKnownDialecteError(error, { catalogues: [SCL_ERRORS] })
		? sentences[error.key]
		: undefined
```

The errors the dialecte declares (`SCL_ERRORS`), beside those of the core catalogue:

- `MAPPING_CHOICE_UNKNOWN` (`SCL1001`): raised when a mapping choice is passed for a source element the report does not list. `meta`: `sourceId`
- `MAPPING_CHOICE_LOCKED` (`SCL1003`): raised when a mapping choice is passed for a mapping the instance already carries. `meta`: `sourceId`, `tagName`
- `MAPPING_CHOICE_NOT_A_CANDIDATE` (`SCL1004`): raised when a mapping choice names a project element that is not a candidate. `meta`: `sourceId`, `tagName`, `chosen: { tagName, id }`
- `MAPPING_UNDECIDED` (`SCL1005`): raised when a write is asked while where an element of the template lands is the consumer's to choose. `meta`: `sourceId`, `tagName`, `kind` (`level` \| `shared`), `operation?`
- `DECISION_DEPENDENCY_SKIPPED` (`SCL1006`): raised when a group is accepted while a group it depends on is skipped. `meta`: `groupId`, `dependencyId`
- `REVISION_BASE_WITHOUT_FORK` (`SCL1007`): raised when a previous revision (`baseQuery`) is given to an operation that is not a fork. `meta`: `scenario`
- `REVISION_BASE_OTHER_FILE` (`SCL1008`): raised when the previous revision given to a fork is another file: its `Header` names another file than the newer one's. `meta`: `fileUuid`, `baseFileUuid`
- `OPTION_NOT_AVAILABLE` (`SCL1009`): raised when an option takes a value the operation does not offer yet, given or by default (an extract with `as: 'revision'`; `extract.fsd` of a function in a line or a process with `placement: 'source-level'`, the default; `extract.ied` without an explicit `kind` or `inputs`; a source of an extension the operation does not read, `option: 'sourceExtension'`; an IED report reconciling an IED the project holds, `option: 'scenario'`; an IED read from an IID or an SCD, or the IED of an ISD instance file, `option: 'source'`, `value: 'iid'` \| `'scd'` \| `'isd-instance'`). `meta`: `option`, `value`
- `IDENTITY_COLLISION` (`SCL1010`): raised when an element the operation writes shares with one of the project, in the same place, every field of a key none of which can be changed (a logical node's class, instance, prefix, device and IED). `meta`: `constraint`, `fields`, `element: { tagName, id }`, `collidesWith: { tagName, id }`
- `DECISION_UNKNOWN` (`SCL1011`): raised when a decision is passed for a group the report does not list. `meta`: `groupId`
- `DECISION_DEPENDENCY_UNKNOWN` (`SCL1012`): raised when a group of the report depends on a group the report does not list. `meta`: `groupId`, `dependencyId`
- `REPORT_TARGET_MISMATCH` (`SCL1013`): raised when a report is applied to another target than the one it was made for, or carries none. `meta`: `field` (`report`, `document`, `source`, `verb`, `ref`, `anchor`, `scenario`, `targetInstance`, `fileType`)
- `REPORT_STALE` (`SCL1014`): raised when a report names an element the document no longer holds: an instance it covers, an element a mapping or a mapping choice lands on. `meta`: `element: { tagName, id }`, `kind` (`instance` \| `mapping`)
- `NOT_A_VERSION_OF_FILE` (`SCL1015`): raised when a fork on an open ISD document is given a file that is not a version of it: its `Header` names another file (a file imported without a `Header` uuid is given a fresh one, so it is another file), or the same file holds another IED. `meta`: `reason` (`other-file` \| `other-ied`); `fileUuid`, `otherFileUuid` for `other-file`; `iedUuid` (the open ISD's first IED), `otherIedUuid` for `other-ied`, each only when that IED carries a uuid
- `TEMPLATE_ROOT_NOT_FOUND` (`SCL2001`): raised when the template file holds nothing that can be instantiated, or not the element an SSD operation names. `meta`: —
- `TARGET_HEADER_MISSING` (`SCL2002`): raised when the project has no `Header` to record the source file in. `meta`: —
- `SSD_SCOPE_AMBIGUOUS` (`SCL2003`): raised when an SSD whose first named level holds several elements to instantiate (a unit, or units linked by a reference) is asked for while `ref` names the `TEMPLATE` scaffolding above them (or, for `instantiate.ssd` / `update.ssd`, nothing). `meta`: `candidates: [{ tagName, id, name, linked }]`
- `FUNCTION_TEMPLATE_CANNOT_HOLD` (`SCL2004`): raised when a function extracted as a function template holds what a function template cannot hold: an element at the function's own level, or categories classifying it. `meta`: `tags` (the elements in question, by tag, sorted)
- `IED_NOT_SPECIFICATION` (`SCL2005`): raised when `extract.ied` selects an implemented IED rather than a specification IED. `meta`: `ied: { tagName, id }`
- `EXTRACTION_TARGET_NOT_EMPTY` (`SCL2006`): raised when the target of `extract.ied` already holds an IED, a substation, a line or a process. `meta`: -
- `EXTRACTION_CONF_REV_INVALID` (`SCL2007`): raised when an affected extracted Report/GSE/SV control has a missing or invalid unsigned 32-bit `confRev`; refused before output writes. `meta`: `source: { tagName, id }`, `value` (absent when missing); error `ref` names the source control
- `EXTRACTION_CONF_REV_OVERFLOW` (`SCL2008`): raised when incrementing an affected extracted Report/GSE/SV control's `confRev` by `10000` would exceed `4294967295`; refused before output writes. `meta`: `source: { tagName, id }`, `value`; error `ref` names the source control
- `SSD_TEMPLATE_NOT_UNIQUE` (`SCL2009`): raised when a level of an SSD template holds several elements named `TEMPLATE` (two substations of the file, two voltage levels of a substation, two bays of a voltage level): nothing is written. `meta`: `parent` (`{ tagName, id, name? }`: the element holding them, the file's root for substations), `duplicates` (`[{ tagName, id, name }]`, in document order)
- `DECISION_REQUIRED` (`SCL2010`): raised when `apply`, or `update.ied` given a report, is given decisions that do not name a group the report says waits for one (`requiresDecision`: a value no longer allowed by its type, a reference to data the update deletes, a change to another IED, a binding to another IED taken away): nothing is written. `meta`: `groupIds` (every such group left out)
- `TAKE_OVER_NOT_OFFERED` (`SCL2011`): raised when `report` is given a take-over (`resolution.takeOver`) naming an element that keeps no value the project may set, itself or below it (an IED or an element inside it). `meta`: `element: { tagName, id }` (the first one)
- `TARGET_INSTANCE_REQUIRED` (`SCL2012`): raised when an IED update (`report` / `apply` / `update.ied`, `verb: 'ied'`) finds several IEDs placed from the template and `targetInstance` names none of them, or names an element that is no instance, or names one while the project holds none placed from the template. `meta`: `instances: { tagName, id }[]`, `named?: { tagName, id }`
- `SPECIFICATION_BUILD_REFUSED` (`SCL2013`): raised when `tx.specification.buildIed` would break a building rule (see the specification extension): nothing is written. `meta`: `reason` (the first refusal's), `refusals: { reason, ref?, detail }[]`
- `SPECIFICATION_STAGE_REFUSED` (`SCL2014`): raised when `tx.specification.stageIsd` cannot stage these logical nodes (see the specification extension): nothing is written. `meta`: `reason` (`target-not-empty`, `lnode-outside-process`, `shell-not-specification`, `no-lnodes`, `ied-name`, `type-missing`), `stage: 'stageIsd'`, `ref?`
- `IED_NOT_IMPLEMENTED` (`SCL2015`): raised when `extract.ied` with `fileType: 'CID'` selects a specification IED rather than a real IED. `meta`: `ied: { tagName, id }`
- `IED_NOT_CONNECTED` (`SCL2016`): raised when `extract.ied` with `fileType: 'CID'` selects an IED none of whose connections holds an address. `meta`: `ied: { tagName, id }`
- `DATAFLOW_LINK_TARGET_MISMATCH` (`SCL3001`): raised when `tx.dataflow.link` links a signal to an element it cannot be implemented by (a `SourceRef` to an `ExtCtrl`). `meta`: `signal: { tagName, id }`, `implementation: { tagName, id }`
- `DATAFLOW_UNSUBSCRIBE_REFUSED` (`SCL3002`): raised when `tx.dataflow.unsubscribe` would change an IED whose engineering right is `fix` (it holds a given `ExtRef` or one of its companions): nothing is written. `meta`: `reason: 'eng-right-fix'`, `ied: { tagName, id }`
- `CHILD_LEFT_BEHIND` (`SCL4001`): raised when a commit deletes a record and leaves one of its children in the store without a parent (a hook that staged a delete without the subtree). `meta`: `record: { tagName, id }`, `child: { tagName, id }` (the first pair found)
- `REFERENCE_NAMES_UNRESOLVED` (`SCL4002`): raised when a transaction edits the names of a reference between IEDs that holds a uuid (or moves the `ConnectedAP` above a `GSE` / `SMV` to another IED), or the path of a path reference that holds one, so that they name no element or several: the uuid is never dropped by such an edit; removing every name of the pair unbinds it instead. `meta`: `reference: { tagName, id }`, `uuidAttribute`, `address` (what the names name), `resolved: 'none' | 'several'`; `dataPath` when the path names its element and data the element's type does not hold, with `untyped: true` when the element has no type to split it by
- `MOVE_NOT_FOLLOWED` (`SCL4003`): raised when a transaction moves a subtree holding what references name by its place and a move does not follow yet: a logical node, a logical device, an access point, a control block, what sits only below a logical node (a data instance, a data set, an input), or a reference reading its IED from where it sits moved away from it (a `GSE` / `SMV` moved to another `ConnectedAP`, a `ServerAt`); a logical node or logical device moved within its IED is followed, unless the device goes to an access point with no `ConnectedAP` on the subnetwork of an address it sends; a reference naming its IED outright (an `LNode`, a `ConnectedAP`) moves as it is. `meta`: `moved: { tagName, id }`, `parent: { tagName, id }` (the first such move, and the parent it was given; `commitPrune({ collect: true })` lists every one, one per move and cause)
- `REFERENCE_INCOHERENT` (`SCL4004`): raised when a transaction writes a uuid reference (creates it holding its uuid, gives it a uuid, or changes its data names) that cannot be named coherently: `data-missing`, it holds an LNode uuid without the data object the registry requires beside it; `groups-together`, a behaviour variable (`InputVar`, `OutputVar`) holds its data group and its input or output group at once; `out-of-scope`, a behaviour variable names an element its local path cannot reach (not at or below the level holding its `BehaviorDescription`). A copy carrying such a stored reference is refused too; `uuid-unresolved`, an existing path reference whose uuid the transaction changes to one naming no element of the document (a reference created with such a uuid, a copy's among them, is not refused; a reference named by a tuple is not checked); a rename, a move or a delete that only rewrites or clears paths is not. `meta`: `reference: { tagName, id }`, `uuidAttribute` (for `groups-together`, the uuid attribute of the last group in the registry's order the transaction set), `reason: 'data-missing' | 'groups-together' | 'out-of-scope' | 'uuid-unresolved'` (the first; `commitPrune({ collect: true })` lists every one)

Anything else the lifecycle or the dataflow raises uses a key of the core catalogue (`ELEMENT_NOT_FOUND`, `UNIQUE_CONSTRAINT_VIOLATION`, `ASSERTION_FAILED`) — an internal inconsistency rather than something the consumer passed.

## Import diagnostics

The import says what it found in a file instead of refusing it: each imported file's entry carries `diagnostics`, `[]` when there is nothing to say (`project.import(files)` returns one entry per file, `project.importFile(file)` the imported document). A diagnostic is core's [`Diagnostic`](https://dialecte.github.io/core/io/hooks#diagnostics), plain data: `code`, `severity`, `source` (`'scl'`), `message`, `ref` (the element, and the attribute when it is about one), `related` (the other elements involved) and `meta` (the values concerned). The codes, with their severity, family and default wording, are in `SCL_IMPORT_DIAGNOSTICS`; `SclImportDiagnosticCode` is the union of the codes.

A `warning` says the file is not what it says (a reference is left without its uuid, or written again from the element its uuid names); an `information` says the file was corrected on import (nothing is wrong once it is stored).

| `code`                         | Severity      | Reported when                                                                                                                                                                                                                                                                                                                                                                                                                                         | `ref`                             | `meta`                                                                       |
| ------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `unresolved-reference`         | `warning`     | a reference written as a path names no element of the file                                                                                                                                                                                                                                                                                                                                                                                            | the reference, its path attribute | `uuidAttribute`, `pathValue`, `triedKeys`                                    |
| `ambiguous-reference`          | `warning`     | a reference written as a path names several elements of the file (they hold the same path): it is left without its uuid                                                                                                                                                                                                                                                                                                                               | the reference, its path attribute | `uuidAttribute`, `pathValue`, `sharedKey`                                    |
| `unsupported-xpath-reference`  | `warning`     | a reference is written in a form that is not resolved                                                                                                                                                                                                                                                                                                                                                                                                 | the reference, its path attribute | `uuidAttribute`, `pathValue`                                                 |
| `incoherent-reference`         | `warning`     | the path and the uuid of a reference name two different elements: the uuid wins, the path is written from it                                                                                                                                                                                                                                                                                                                                          | the reference, its path attribute | `uuidAttribute`, `pathValue`, `uuidValue`                                    |
| `data-path-not-split`          | `warning`     | a reference written with the path of an LNode could not be given the data-object name a data reference by uuid carries: it is left as read (without the uuid when the file gave none)                                                                                                                                                                                                                                                                 | the reference, its path attribute | `pathValue`; `untyped: true` when the LNode has no type to split the data by |
| `exclusive-reference-groups`   | `warning`     | a behaviour variable (`InputVar`, `OutputVar`) names data and its input or output at once: the two groups are never set together; each is still read as written                                                                                                                                                                                                                                                                                       | the variable                      | `attributes`: the reference attributes it holds, group by group              |
| `unwritten-reference-path`     | `warning`     | a reference holding a uuid gets no path from the element that uuid names: kept as read (a path it held kept), `meta.reason` saying why: `uuid-unresolved` (the uuid names no element of the file), `wrong-target` (an element the reference cannot point at, or one no path names: an input with no address of its own), `out-of-scope` (an element out of its behaviour's reach), `data-missing` (its behaviour's own element, no data object named) | the reference, its path attribute | `uuidAttribute`, `uuidValue`, `reason`, `pathValue` when it holds a path     |
| `incoherent-path-names`        | `information` | names written from a path disagree with it (a terminal's level names, a node's `pathName`): written again from it                                                                                                                                                                                                                                                                                                                                     | the element holding them          | `attributes` (`name`, `value`, `expected`)                                   |
| `derived-specification-naming` | `information` | an LNode bound to a real IED had no `LNodeSpecNaming`: it got one from the LN it is bound to (prefix, class, instance)                                                                                                                                                                                                                                                                                                                                | the LNode                         | `iedName`, `specifiedNaming`                                                 |

Mapped data (`DOS`, `SDS`, `DAS`) has its `unresolved-reference` with empty `triedKeys`; named by its uuid alone, the diagnostic is on its uuid attribute and `pathValue` holds that uuid. An `incoherent-reference` lists in `related` the element its uuid names, then the element its path names, each when the file holds it; the `message` of each is a value of `INCOHERENT_REFERENCE_RELATED` (`uuidTarget`, `pathTarget`).

For a reference of the IED section named by attributes ([`TUPLE_REFERENCE_PAIRS`](../extensions/reference#references-of-the-ied-section-named-by-their-attributes)), an `incoherent-reference` diagnostic gives in `ref.attribute` the attributes naming the target, space-separated (`iedName ldInst prefix lnClass lnInst`), and in `meta.pathValue` what they named (`P1/LD0/LLN0`). Its names are written from the element the uuid names, unless that element is one the reference cannot point at (another tag, such as a logical node for an `apUuid`; another kind of control block than its service; another IED than the one it names by where it sits) or no names can name every uuid it holds and keep its other names: it is then left as read.

`isSclImportDiagnostic(diagnostic)` narrows a diagnostic to the typed union `SclImportDiagnostic` (it checks `source` and `code`), so a `switch` on `code` reads that code's `meta`. Each member is exported under its own name: `UnresolvedReferenceDiagnostic`, `UnwrittenReferencePathDiagnostic` (its `reason` an `UnwrittenReferencePathReason`), `UnsupportedXPathDiagnostic`, `IncoherentReferenceDiagnostic` (each related element an `IncoherentReferenceRelated`), `DataPathNotSplitDiagnostic`, `ExclusiveReferenceGroupsDiagnostic`, `IncoherentPathNamesDiagnostic` (each attribute an `IncoherentPathName`), `DerivedSpecificationNamingDiagnostic`.

```ts
import { createSclProject, isSclImportDiagnostic } from '@dialecte/scl/v2019C1'

const project = await createSclProject().open('my-project')
const entries = await project.import(files)
for (const entry of entries) {
	if (entry.status === 'failed') continue // entry.error: the file was not imported
	for (const diagnostic of entry.diagnostics) {
		if (!isSclImportDiagnostic(diagnostic)) continue
		switch (diagnostic.code) {
			case 'unresolved-reference':
				console.warn(`${diagnostic.ref.tagName} ${diagnostic.meta.pathValue}: not in the file`)
				break
			case 'incoherent-reference':
				console.warn(
					diagnostic.message,
					diagnostic.related.map(({ ref }) => ref.id),
				)
				break
		}
	}
}
```

Up to 0.11 these were warnings (`SclImportWarning`, `SCL_IMPORT_WARNINGS`) that core dropped: `type` is now `code`, `recordId` is `ref.id`, `details.elementTag` is `ref.tagName`, `details.pathAttribute` is `ref.attribute`, and the rest of `details` is `meta`.

## Identity warnings

`checkTemplateUuids` reports what makes the identity of a file unreliable. Each warning carries its `code`, the offending `value`, the `tagNames` and `refs` involved and a default `message`; `TEMPLATE_UUID_WARNING_INFO[code]` gives the default wording of the class (`title`, `description`) and what the engine does about it (`fallback`) — as facts about the engine, not as instructions for a user.

| `code`                        | What it means                                                       |
| ----------------------------- | ------------------------------------------------------------------- |
| `cross-type-template-uuid`    | one `templateUuid` is carried by elements of several types          |
| `duplicate-instance-uuid`     | one `uuid` is carried by several elements                           |
| `template-uuid-type-mismatch` | a `templateUuid` resolves in the file to an element of another type |
