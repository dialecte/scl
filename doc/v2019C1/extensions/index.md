---
description: Overview of SCL-specific extensions for @dialecte/scl v2019C1 -- history, dataModel, signature, reference, extraction, presentation and cleanUp.
---

# Extensions

Extensions add domain-specific methods to `doc.query` and `tx` under named groups. They are plain functions registered via `mergeExtensions()` and bound automatically by `createSclProject`.

For a full explanation of how extensions work, see the [Writing Extensions](https://dialecte.github.io/core/guide/extensions/) guide in the core documentation.

## Registered modules

| Module         | Access on `doc.query`    | Access on `tx`   | Reference                      |
| -------------- | ------------------------ | ---------------- | ------------------------------ |
| `cleanUp`      | -                        | `tx.cleanUp`     | [Clean-up](./clean-up)         |
| `dataModel`    | `doc.query.dataModel`    | `tx.dataModel`   | [Data Model](./data-model)     |
| `extract`      | -                        | `tx.extract`     | [Extract](./extract)           |
| `instantiate`  | -                        | `tx.instantiate` | [Instantiate](./instantiate)   |
| `transplant`   | -                        | `tx.transplant`  | [Transplant](./transplant)     |
| `history`      | `doc.query.history`      | `tx.history`     | [History](./history)           |
| `presentation` | `doc.query.presentation` | -                | [Presentation](./presentation) |
| `reference`    | `doc.query.reference`    | `tx.reference`   | [Reference](./reference)       |
| `signature`    | `doc.query.signature`    | -                | [Signature](./signature)       |

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
	await tx.extract.ensureSubstationTemplateStructure()
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
