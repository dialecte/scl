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

| Key                              | Code      | Raised when                                                                                                                                                                                                                            | `meta`                                                                                          |
| -------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `MAPPING_CHOICE_UNKNOWN`         | `SCL1001` | a mapping choice is passed for a source element the report does not list                                                                                                                                                               | `sourceId`                                                                                      |
| `MAPPING_CHOICE_LOCKED`          | `SCL1003` | a mapping choice is passed for a mapping the instance already carries                                                                                                                                                                  | `sourceId`, `tagName`                                                                           |
| `MAPPING_CHOICE_NOT_A_CANDIDATE` | `SCL1004` | a mapping choice names a project element that is not a candidate                                                                                                                                                                       | `sourceId`, `tagName`, `chosen: { tagName, id }`                                                |
| `MAPPING_UNDECIDED`              | `SCL1005` | a write is asked while where an element of the template lands is the consumer's to choose                                                                                                                                              | `sourceId`, `tagName`, `kind` (`level` \| `shared`), `operation?`                               |
| `DECISION_DEPENDENCY_SKIPPED`    | `SCL1006` | a group is accepted while a group it depends on is skipped                                                                                                                                                                             | `groupId`, `dependencyId`                                                                       |
| `REVISION_BASE_WITHOUT_FORK`     | `SCL1007` | a previous revision (`baseQuery`) is given to an operation that is not a fork                                                                                                                                                          | `scenario`                                                                                      |
| `REVISION_BASE_OTHER_FILE`       | `SCL1008` | the previous revision given to a fork is another file: its `Header` names another file than the newer one's                                                                                                                            | `fileUuid`, `baseFileUuid`                                                                      |
| `OPTION_NOT_AVAILABLE`           | `SCL1009` | an option takes a value the operation does not offer yet, given or by default (an extract with `as: 'revision'`; `extract.fsd` of a function in a line or a process with `placement: 'source-level'`, the default)                     | `option`, `value`                                                                               |
| `IDENTITY_COLLISION`             | `SCL1010` | an element the operation writes shares with one of the project, in the same place, every field of a key none of which can be changed (a logical node's class, instance, prefix, device and IED)                                        | `constraint`, `fields`, `element: { tagName, id }`, `collidesWith: { tagName, id }`             |
| `DECISION_UNKNOWN`               | `SCL1011` | a decision is passed for a group the report does not list                                                                                                                                                                              | `groupId`                                                                                       |
| `DECISION_DEPENDENCY_UNKNOWN`    | `SCL1012` | a group of the report depends on a group the report does not list                                                                                                                                                                      | `groupId`, `dependencyId`                                                                       |
| `REPORT_TARGET_MISMATCH`         | `SCL1013` | a report is applied to another target than the one it was made for, or carries none                                                                                                                                                    | `field` (`report`, `document`, `source`, `verb`, `ref`, `anchor`, `scenario`, `targetInstance`) |
| `REPORT_STALE`                   | `SCL1014` | a report names an element the document no longer holds: an instance it covers, an element a mapping or a mapping choice lands on                                                                                                       | `element: { tagName, id }`, `kind` (`instance` \| `mapping`)                                    |
| `TEMPLATE_ROOT_NOT_FOUND`        | `SCL2001` | the template file holds nothing that can be instantiated, or not the element an SSD operation names                                                                                                                                    | —                                                                                               |
| `TARGET_HEADER_MISSING`          | `SCL2002` | the project has no `Header` to record the source file in                                                                                                                                                                               | —                                                                                               |
| `SSD_SCOPE_AMBIGUOUS`            | `SCL2003` | an SSD whose first named level holds several elements to instantiate (a unit, or units linked by a reference) is asked for while `ref` names the `TEMPLATE` scaffolding above them (or, for `instantiate.ssd` / `update.ssd`, nothing) | `candidates: [{ tagName, id, name, linked }]`                                                   |
| `FUNCTION_TEMPLATE_CANNOT_HOLD`  | `SCL2004` | a function extracted as a function template holds what a function template cannot hold: an element at the function's own level, or categories classifying it                                                                           | `tags` (the elements in question, by tag, sorted)                                               |
| `IED_NOT_SPECIFICATION`          | `SCL2005` | `extract.ied` selects an implemented IED rather than a specification IED                                                                                                                                                               | `ied: { tagName, id }`                                                                          |
| `EXTRACTION_TARGET_NOT_EMPTY`    | `SCL2006` | the target of `extract.ied` already holds an IED                                                                                                                                                                                       | -                                                                                               |
| `EXTRACTION_CONF_REV_INVALID`    | `SCL2007` | an affected extracted Report/GSE/SV control has a missing or invalid unsigned 32-bit `confRev`; refused before output writes                                                                                                           | `source: { tagName, id }`, `value` (absent when missing); error `ref` names the source control  |
| `EXTRACTION_CONF_REV_OVERFLOW`   | `SCL2008` | incrementing an affected extracted Report/GSE/SV control's `confRev` by `10000` would exceed `4294967295`; refused before output writes                                                                                                | `source: { tagName, id }`, `value`; error `ref` names the source control                        |
| `DATAFLOW_LINK_TARGET_MISMATCH`  | `SCL3001` | `tx.dataflow.link` links a signal to an element it cannot be implemented by (a `SourceRef` to an `ExtCtrl`)                                                                                                                            | `signal: { tagName, id }`, `implementation: { tagName, id }`                                    |
| `CHILD_LEFT_BEHIND`              | `SCL4001` | a commit deletes a record and leaves one of its children in the store without a parent (a hook that staged a delete without the subtree)                                                                                               | `record: { tagName, id }`, `child: { tagName, id }` (the first pair found)                      |

Anything else the lifecycle or the dataflow raises uses a key of the core catalogue (`ELEMENT_NOT_FOUND`, `UNIQUE_CONSTRAINT_VIOLATION`, `ASSERTION_FAILED`) — an internal inconsistency rather than something the consumer passed.

## Import diagnostics

The import says what it found in a file instead of refusing it: each imported file's entry carries `diagnostics`, `[]` when there is nothing to say (`project.import(files)` returns one entry per file, `project.importFile(file)` the imported document). A diagnostic is core's [`Diagnostic`](https://dialecte.github.io/core/io/hooks#diagnostics), plain data: `code`, `severity`, `source` (`'scl'`), `message`, `ref` (the element, and the attribute when it is about one), `related` (the other elements involved) and `meta` (the values concerned). The codes, with their severity, family and default wording, are in `SCL_IMPORT_DIAGNOSTICS`; `SclImportDiagnosticCode` is the union of the codes.

A `warning` says the file is not what it says (a reference is left without its uuid, or written again from the element its uuid names); an `information` says the file was corrected on import (nothing is wrong once it is stored).

| `code`                         | Severity      | Reported when                                                                                                                                                | `ref`                             | `meta`                                     |
| ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------ |
| `unresolved-reference`         | `warning`     | a reference written as a path names no element of the file                                                                                                   | the reference, its path attribute | `uuidAttribute`, `pathValue`, `triedKeys`  |
| `unsupported-xpath-reference`  | `warning`     | a reference is written in a form that is not resolved                                                                                                        | the reference, its path attribute | `uuidAttribute`, `pathValue`               |
| `incoherent-reference`         | `warning`     | the path and the uuid of a reference name two different elements: the uuid wins, the path is written from it                                                 | the reference, its path attribute | `uuidAttribute`, `pathValue`, `uuidValue`  |
| `data-path-not-split`          | `warning`     | a reference written with the path of an LNode could not be given the data-object name a data reference by uuid carries: it is left as read, without the uuid | the reference, its path attribute | `pathValue`                                |
| `incoherent-path-names`        | `information` | names written from a path disagree with it (a terminal's level names, a node's `pathName`): written again from it                                            | the element holding them          | `attributes` (`name`, `value`, `expected`) |
| `derived-specification-naming` | `information` | an LNode bound to an IED had no `LNodeSpecNaming`: it got one from the LN it is bound to (prefix, class, instance)                                           | the LNode                         | `iedName`, `specifiedNaming`               |

Mapped data (`DOS`, `SDS`, `DAS`) has its `unresolved-reference` with empty `triedKeys`; named by its uuid alone, the diagnostic is on its uuid attribute and `pathValue` holds that uuid. An `incoherent-reference` lists in `related` the element its uuid names, then the element its path names, each when the file holds it; the `message` of each is a value of `INCOHERENT_REFERENCE_RELATED` (`uuidTarget`, `pathTarget`).

For a reference of the IED section named by attributes ([`TUPLE_REFERENCE_PAIRS`](../extensions/reference#references-of-the-ied-section-named-by-their-attributes)), an `incoherent-reference` diagnostic gives in `ref.attribute` the attributes naming the target, space-separated (`iedName ldInst prefix lnClass lnInst`), and in `meta.pathValue` what they named (`P1/LD0/LLN0`). Its names are written from the element the uuid names, unless that element is one the reference cannot point at (another tag, such as a logical node for an `apUuid`; another kind of control block than its service; another IED than the one it names by where it sits) or no names can name every uuid it holds and keep its other names: it is then left as read.

`isSclImportDiagnostic(diagnostic)` narrows a diagnostic to the typed union `SclImportDiagnostic` (it checks `source` and `code`), so a `switch` on `code` reads that code's `meta`. Each member is exported under its own name: `UnresolvedReferenceDiagnostic`, `UnsupportedXPathDiagnostic`, `IncoherentReferenceDiagnostic` (each related element an `IncoherentReferenceRelated`), `DataPathNotSplitDiagnostic`, `IncoherentPathNamesDiagnostic` (each attribute an `IncoherentPathName`), `DerivedSpecificationNamingDiagnostic`.

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
