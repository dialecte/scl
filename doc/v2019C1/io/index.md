---
description: IO overview for @dialecte/scl v2019C1 — how project.import and project.export relate to the Document API.
---

# IO

SCL IO is exposed through the `Project` returned by `createSclProject`. The SCL config, extensions, and hooks are pre-applied — no extra wiring needed.

## Two layers, one pipeline

| Layer   | Entry point                        | What it does                                                                                     |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| **IO**  | `project.import`, `project.export` | Streams SCL files in/out of IndexedDB. No transactions.                                          |
| **API** | `project.openDocument(documentId)` | Opens a document backed by IndexedDB. All reads and writes go through `Query` and `Transaction`. |

```
SCL file (.scd / .icd / ...)
  └─ project.import()             ← IO layer (SAX stream → IndexedDB)
        └─ project.openDocument(id)    ← API layer (IndexedDB → Document)
              ├─ doc.query.*               (reads)
              └─ doc.transaction()         (writes)
                    └─ project.export(id)   ← IO layer (IndexedDB → SCL file)
```

## Typical workflow

```ts
import { createSclProject } from '@dialecte/scl/v2019C1'

const project = await createSclProject({ storage: { type: 'local' } }).open('my-project')

// 1. Import
const [{ documentId }] = await project.import([scdFile])

// 2. Work
const doc = project.openDocument(documentId)
await doc.transaction(async (tx) => {
	await tx.update(ref, { attributes: { name: 'new-name' } })
})

// 3. Export
const { xmlDocument } = await project.export(documentId)
```

## Further reading

- [IO reference](/v2019C1/io/io) - `project.import`, `project.export`
- [IO hooks](/v2019C1/io/hooks) - SCL import lifecycle hooks
- [Core IO](https://dialecte.github.io/core/io/) - underlying IO layer and configuration
