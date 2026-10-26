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

| Key                              | Code      | Raised when                                                                                                                                                                                     | `meta`                                                                              |
| -------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `MAPPING_CHOICE_UNKNOWN`         | `SCL1001` | a mapping choice is passed for a source element the report does not list                                                                                                                        | `sourceId`                                                                          |
| `MAPPING_CHOICE_NOT_SELECTABLE`  | `SCL1002` | a mapping choice is passed for an element whose mapping cannot be chosen                                                                                                                        | `sourceId`, `tagName`                                                               |
| `MAPPING_CHOICE_LOCKED`          | `SCL1003` | a mapping choice is passed for a mapping the instance already carries                                                                                                                           | `sourceId`, `tagName`                                                               |
| `MAPPING_CHOICE_NOT_A_CANDIDATE` | `SCL1004` | a mapping choice names a project element that is not a candidate                                                                                                                                | `sourceId`, `tagName`, `chosen: { tagName, id }`                                    |
| `MAPPING_UNDECIDED`              | `SCL1005` | a write is asked while where an element of the template lands is the consumer's to choose                                                                                                       | `sourceId`, `tagName`, `kind` (`level` \| `shared`), `operation?`                   |
| `DECISION_DEPENDENCY_SKIPPED`    | `SCL1006` | a group is accepted while a group it depends on is skipped                                                                                                                                      | `groupId`, `dependencyId`                                                           |
| `REVISION_BASE_WITHOUT_FORK`     | `SCL1007` | a previous revision (`baseQuery`) is given to an operation that is not a fork                                                                                                                   | `scenario`                                                                          |
| `REVISION_BASE_OTHER_FILE`       | `SCL1008` | the previous revision given to a fork is another file: its `Header` names another file than the newer one's                                                                                     | `fileUuid`, `baseFileUuid`                                                          |
| `OPTION_NOT_AVAILABLE`           | `SCL1009` | an option is given a value the operation does not offer yet (an extract with `as: 'revision'`)                                                                                                  | `option`, `value`                                                                   |
| `IDENTITY_COLLISION`             | `SCL1010` | an element the operation writes shares with one of the project, in the same place, every field of a key none of which can be changed (a logical node's class, instance, prefix, device and IED) | `constraint`, `fields`, `element: { tagName, id }`, `collidesWith: { tagName, id }` |
| `DECISION_UNKNOWN`               | `SCL1011` | a decision is passed for a group the report does not list                                                                                                                                       | `groupId`                                                                           |
| `DECISION_DEPENDENCY_UNKNOWN`    | `SCL1012` | a group of the report depends on a group the report does not list                                                                                                                               | `groupId`, `dependencyId`                                                           |
| `TEMPLATE_ROOT_NOT_FOUND`        | `SCL2001` | the template file holds nothing that can be instantiated                                                                                                                                        | —                                                                                   |
| `TARGET_HEADER_MISSING`          | `SCL2002` | the project has no `Header` to record the source file in                                                                                                                                        | —                                                                                   |
| `DATAFLOW_LINK_TARGET_MISMATCH`  | `SCL3001` | `tx.dataflow.link` links a signal to an element it cannot be implemented by (a `SourceRef` to an `ExtCtrl`)                                                                                     | `signal: { tagName, id }`, `implementation: { tagName, id }`                        |

Anything else the lifecycle or the dataflow raises uses a key of the core catalogue (`ELEMENT_NOT_FOUND`, `UNIQUE_CONSTRAINT_VIOLATION`, `ASSERTION_FAILED`) — an internal inconsistency rather than something the consumer passed.

## Import warnings

The import reports warnings instead of refusing a file. Their type is exported as `SclImportWarning` (a union, one member per `type`; `SclImportWarningType` is the union of the codes). `type` is the code, `details` the data; the default wording of each type is in `SCL_IMPORT_WARNINGS`.

| `type`                         | Reported when                                                                                                                                                | `details`                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `unresolved-reference`         | a reference written as a path names no element of the file                                                                                                   | `elementTag`, `uuidAttribute`, `pathValue`, `triedKeys`                  |
| `unsupported-xpath-reference`  | a reference is written in a form that is not resolved                                                                                                        | `elementTag`, `pathAttribute`, `uuidAttribute`, `pathValue`              |
| `incoherent-reference`         | the path and the uuid of a reference name two different elements: the uuid wins, the path is written from it                                                 | `elementTag`, `pathAttribute`, `pathValue`, `uuidAttribute`, `uuidValue` |
| `incoherent-path-names`        | names written from a path disagree with it (a terminal's level names, a node's `pathName`): written again from it                                            | `elementTag`, `attributes` (`name`, `value`, `expected`)                 |
| `data-path-not-split`          | a reference written with the path of an LNode could not be given the data-object name a data reference by uuid carries: it is left as read, without the uuid | `elementTag`, `pathAttribute`, `pathValue`                               |
| `derived-specification-naming` | an LNode bound to an IED had no `LNodeSpecNaming`: it got one from the LN it is bound to (prefix, class, instance)                                           | `iedName`, `specifiedNaming`                                             |

For a reference of the IED section named by attributes ([`TUPLE_REFERENCE_PAIRS`](../extensions/reference#references-of-the-ied-section-named-by-their-attributes)), an `incoherent-reference` warning gives in `pathAttribute` the attributes naming the target, space-separated (`iedName ldInst prefix lnClass lnInst`), and in `pathValue` what they named (`P1/LD0/LLN0`). Its names are written from the element the uuid names, unless that element is one the reference cannot point at (another tag, such as a logical node for an `apUuid`; another kind of control block than its service; another IED than the one it names by where it sits) or no names can name every uuid it holds and keep its other names: it is then left as read.

Each member is exported under its own name, to narrow a warning by its `type`: `UnresolvedReferenceWarning`, `UnsupportedXPathWarning`, `IncoherentReferenceWarning`, `IncoherentPathNamesWarning` (each attribute an `IncoherentPathName`), `DataPathNotSplitWarning`, `DerivedSpecificationNamingWarning`.

## Identity warnings

`checkTemplateUuids` reports what makes the identity of a file unreliable. Each warning carries its `code`, the offending `value`, the `tagNames` and `refs` involved and a default `message`; `TEMPLATE_UUID_WARNING_INFO[code]` gives the default wording of the class (`title`, `description`) and what the engine does about it (`fallback`) — as facts about the engine, not as instructions for a user.

| `code`                        | What it means                                                       |
| ----------------------------- | ------------------------------------------------------------------- |
| `cross-type-template-uuid`    | one `templateUuid` is carried by elements of several types          |
| `duplicate-instance-uuid`     | one `uuid` is carried by several elements                           |
| `template-uuid-type-mismatch` | a `templateUuid` resolves in the file to an element of another type |
