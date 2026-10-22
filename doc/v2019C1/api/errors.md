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
	await doc.prepare((tx) => tx.lifecycle.apply(tx, { ...target, report, resolution }))
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

| Key                              | Code      | Raised when                                                                                                 | `meta`                                                            |
| -------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `MAPPING_CHOICE_UNKNOWN`         | `SCL1001` | a mapping choice is passed for a source element the report does not list                                    | `sourceId`                                                        |
| `MAPPING_CHOICE_NOT_SELECTABLE`  | `SCL1002` | a mapping choice is passed for an element whose mapping cannot be chosen                                    | `sourceId`, `tagName`                                             |
| `MAPPING_CHOICE_LOCKED`          | `SCL1003` | a mapping choice is passed for a mapping the instance already carries                                       | `sourceId`, `tagName`                                             |
| `MAPPING_CHOICE_NOT_A_CANDIDATE` | `SCL1004` | a mapping choice names a project element that is not a candidate                                            | `sourceId`, `tagName`, `chosen: { tagName, id }`                  |
| `MAPPING_UNDECIDED`              | `SCL1005` | a write is asked while where an element of the template lands is the consumer's to choose                   | `sourceId`, `tagName`, `kind` (`level` \| `shared`), `operation?` |
| `DECISION_DEPENDENCY_SKIPPED`    | `SCL1006` | a group is accepted while a group it depends on is skipped                                                  | `groupId`, `dependencyId`                                         |
| `TEMPLATE_ROOT_NOT_FOUND`        | `SCL2001` | the template file holds nothing that can be instantiated                                                    | —                                                                 |
| `TARGET_HEADER_MISSING`          | `SCL2002` | the project has no `Header` to record the source file in                                                    | —                                                                 |
| `DATAFLOW_LINK_TARGET_MISMATCH`  | `SCL3001` | `tx.dataflow.link` links a signal to an element it cannot be implemented by (a `SourceRef` to an `ExtCtrl`) | `signal: { tagName, id }`, `implementation: { tagName, id }`      |

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

Up to 0.10 these were warnings (`SclImportWarning`, `SCL_IMPORT_WARNINGS`) that core dropped: `type` is now `code`, `recordId` is `ref.id`, `details.elementTag` is `ref.tagName`, `details.pathAttribute` is `ref.attribute`, and the rest of `details` is `meta`.

## Identity warnings

`checkTemplateUuids` reports what makes the identity of a file unreliable. Each warning carries its `code`, the offending `value`, the `tagNames` and `refs` involved and a default `message`; `TEMPLATE_UUID_WARNING_INFO[code]` gives the default wording of the class (`title`, `description`) and what the engine does about it (`fallback`) — as facts about the engine, not as instructions for a user.

| `code`                        | What it means                                                       |
| ----------------------------- | ------------------------------------------------------------------- |
| `cross-type-template-uuid`    | one `templateUuid` is carried by elements of several types          |
| `duplicate-instance-uuid`     | one `uuid` is carried by several elements                           |
| `template-uuid-type-mismatch` | a `templateUuid` resolves in the file to an element of another type |
