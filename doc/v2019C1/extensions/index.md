---
description: Overview of SCL-specific extensions for @dialecte/scl v2019C1 -- history, dataModel, signature, reference, lifecycle, presentation and cleanUp.
---

# Extensions

Extensions add domain-specific methods to `doc.query` and `tx` under named groups. They are plain functions registered via `mergeExtensions()` and bound automatically by `createSclProject`.

For a full explanation of how extensions work, see the [Writing Extensions](https://dialecte.github.io/core/guide/extensions/) guide in the core documentation.

## Registered modules

| Module         | Access on `doc.query`        | Access on `tx`                                                                 | Reference                                                                                             |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `cleanUp`      | -                            | `tx.cleanUp`                                                                   | [Clean-up](./clean-up)                                                                                |
| `dataModel`    | `doc.query.dataModel`        | `tx.dataModel`                                                                 | [Data Model](./data-model)                                                                            |
| `lifecycle`    | `doc.query.lifecycle.report` | `tx.lifecycle.extract` / `.instantiate` / `.transplant` / `.update` / `.apply` | [Extract](./extract) · [Instantiate](./instantiate) · [Transplant](./transplant) · [Update](./update) |
| `history`      | `doc.query.history`          | `tx.history`                                                                   | [History](./history)                                                                                  |
| `presentation` | `doc.query.presentation`     | -                                                                              | [Presentation](./presentation)                                                                        |
| `reference`    | `doc.query.reference`        | `tx.reference`                                                                 | [Reference](./reference)                                                                              |
| `signature`    | `doc.query.signature`        | -                                                                              | [Signature](./signature)                                                                              |

`lifecycle` is a single module whose transaction/query methods nest by verb, so the public surface is `tx.lifecycle.<verb>.<recipe>` (e.g. `tx.lifecycle.extract.fsd`, `tx.lifecycle.update.asd`). The verb-agnostic two-track surface — `doc.query.lifecycle.report({ verb, sourceQuery, ref, anchor })` then `tx.lifecycle.apply(tx, { ..., report })` — is the recommended consumer entry point (see [Update](./update#two-track-surface-report-apply)).

## Usage pattern

```ts
import { createSclProject } from '@dialecte/scl/v2019C1'

const project = await createSclProject({ storage: { type: 'local' } }).open('my-project')
const doc = project.openDocument(documentId)

// Query extension — read-only
const latest = await doc.query.history.getLatestHitem()

// Transaction extension — mutation
await doc.transaction(async (tx) => {
	await tx.history.addEntry({ filename, header, item })
	await tx.lifecycle.extract.ensureSubstationTemplateStructure()
})
```

## Public toolkit

Each built-in extension re-exports its constants, type guards and parameter/result types from `@dialecte/scl/v2019C1`, so you can reuse them when authoring custom extensions, hooks, validation or tooling. The runtime extension objects themselves are intentionally **not** re-exported.

```ts
import {
	RESOLUTION_TYPE, // reference
	DEFAULT_IGNORED_ATTRIBUTES, // signature
	type ImportTypesParams, // dataModel
	type ImportDeepParams, // transplant
} from '@dialecte/scl/v2019C1'
```

See each extension's exported surface: [reference](./reference#exported-constants), [signature](./signature#exported-constants--types), [data model](./data-model#exported-types), [transplant](./transplant).

## Internal lifecycle building blocks

The lifecycle verbs are built on a shared engine that is **not** a registered `tx.*` module — consumers import its functions directly only when composing new verbs:

| Area     | Location                      | Reference                          |
| -------- | ----------------------------- | ---------------------------------- |
| `engine` | `extensions/lifecycle/engine` | [Update § Engine](./update#engine) |
