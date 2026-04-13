---
description: IO overview for @dialecte/scl v2019C1 — how importSclFiles and exportSclFile relate to the Document API, and when to use each.
---

# IO

SCL IO wraps `@dialecte/core` IO with the `SCL_DIALECTE_CONFIG` pre-applied. No config argument needed.

## Two layers, one pipeline

| Layer   | Entry point                       | What it does                                                                                     |
| ------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| **IO**  | `importSclFiles`, `exportSclFile` | Streams SCL files in/out of IndexedDB. No transactions.                                          |
| **API** | `openSclDocument`                 | Opens a document backed by IndexedDB. All reads and writes go through `Query` and `Transaction`. |

```
SCL file (.scd / .icd / ...)
  └─ importSclFiles()       ← IO layer (SAX stream → IndexedDB)
        └─ openSclDocument()      ← API layer (IndexedDB → Document)
              ├─ doc.query.*            (reads)
              └─ doc.transaction()      (writes)
                    └─ exportSclFile()  ← IO layer (IndexedDB → SCL file)
```

## Typical workflow

```ts
import { importSclFiles, openSclDocument, exportSclFile } from '@dialecte/scl/v2019C1'

// 1. Import
const [databaseName] = await importSclFiles({ files: [scdFile] })

// 2. Work
const doc = openSclDocument({ type: 'local', databaseName })
await doc.transaction(async (tx) => {
	await tx.update(ref, { attributes: { name: 'new-name' } })
})

// 3. Export
const { xmlDocument } = await exportSclFile({ databaseName, extension: '.scd' })
```

## Further reading

- [IO reference](/v2019C1/io/io) - `importSclFiles`, `exportSclFile`
- [IO hooks](/v2019C1/io/hooks) - SCL import lifecycle hooks
- [Core IO](https://dialecte.github.io/core/io/) - underlying IO layer and configuration
