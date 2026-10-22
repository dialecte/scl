---
description: Reference for @dialecte/scl v2019C1 IO — project.import, project.importFile and project.export.
---

# IO Reference

SCL IO is exposed on the `Project` returned by `createSclProject`. `SCL_DIALECTE_CONFIG` is pre-applied — no config argument needed.

See the [IO overview](/v2019C1/io/) for how these fit alongside `project.openDocument`.

## `project.import`

Parses one or more SCL files, one after the other, and stores each one as a document of the project. A file that fails is its own entry: the files after it are still imported.

```ts
import { createSclProject } from '@dialecte/scl/v2019C1'

const project = await createSclProject({ storage: { type: 'local' } }).open('my-project')
const entries = await project.import([scdFile, icdFile])
for (const entry of entries) {
	if (entry.status === 'failed') console.error(entry.fileName, entry.error.key)
	else console.log(entry.fileName, entry.documentId, entry.diagnostics)
}
```

**Params**

| Param                 | Type      | Description                                                             |
| --------------------- | --------- | ----------------------------------------------------------------------- |
| `files`               | `File[]`  | Browser `File` objects to import                                        |
| `useCustomRecordsIds` | `boolean` | Keep IDs from the file instead of generating new ones. Default: `false` |

**Supported extensions** — `.fsd`, `.asd`, `.ssd`, `.scd`, `.isd`, `.icd`, `.iid`, `.xml`

**Returns** `Promise<ImportEntry[]>` — one entry per file, in the order given: `{ status: 'imported', fileName, documentId, recordCount, diagnostics }`, or `{ status: 'failed', fileName, error }` (`PARSE_ERROR` for a malformed file). `diagnostics` is what the import has to say about the file, `[]` when nothing: see [IO hooks](/v2019C1/io/hooks#diagnostics) and [import diagnostics](/v2019C1/api/errors#import-diagnostics).

---

## `project.importFile`

Imports one file: returns the imported document, or throws what failed.

```ts
const { documentId, recordCount, diagnostics } = await project.importFile(scdFile)
```

**Params** — as `project.import`, with one `File`.

**Returns** `Promise<ImportedDocument>` — `{ fileName, documentId, recordCount, diagnostics }`.

---

## `project.export`

Serializes a stored document back to an SCL file. Optionally triggers a browser download.

```ts
const { xmlDocument, filename } = await project.export(documentId)
```

**Params**

| Param             | Type      | Description                                                   |
| ----------------- | --------- | ------------------------------------------------------------- |
| `documentId`      | `string`  | Document id as returned by `project.import`                   |
| `withDownload`    | `boolean` | Trigger browser file download. Default: `false`               |
| `withDatabaseIds` | `boolean` | Include internal database IDs in the output. Default: `false` |

**Returns** `Promise<{ xmlDocument: XMLDocument; filename: string }>`
