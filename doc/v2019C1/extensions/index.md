---
description: Overview of SCL-specific extensions for @dialecte/scl v2019C1 -- history, dataModel, reference, template, and cleanUp.
---

# Extensions

Extensions add domain-specific methods to `doc.query` and `tx` under named groups. They are plain functions registered via `mergeExtensions()` and bound automatically by `openSclDocument`.

For a full explanation of how extensions work, see the [Writing Extensions](https://dialecte.github.io/core/guide/extensions/) guide in the core documentation.

## Registered modules

| Module         | Access on `doc.query`    | Access on `tx` | Reference                      |
| -------------- | ------------------------ | -------------- | ------------------------------ |
| `cleanUp`      | -                        | `tx.cleanUp`   | [Clean-up](./clean-up)         |
| `dataModel`    | `doc.query.dataModel`    | `tx.dataModel` | [Data Model](./data-model)     |
| `history`      | `doc.query.history`      | `tx.history`   | [History](./history)           |
| `presentation` | `doc.query.presentation` | -              | [Presentation](./presentation) |
| `reference`    | `doc.query.reference`    | -              | [Reference](./reference)       |
| `template`     | -                        | `tx.template`  | [Template](./template)         |

## Usage pattern

```ts
import { openSclDocument } from '@dialecte/scl/v2019C1'

const doc = openSclDocument({ type: 'local', databaseName })

// Query extension — read-only
const latest = await doc.query.history.getLatestHitem()

// Transaction extension — mutation
await doc.transaction(async (tx) => {
	await tx.history.addEntry({ filename, header, item })
	await tx.template.ensureSubstationTemplateStructure()
})
```
