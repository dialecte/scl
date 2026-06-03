---
description: Reference for @dialecte/scl v2019C1 IO — project.import and project.export.
---

# IO Reference

SCL IO is exposed on the `Project` returned by `createSclProject`. `SCL_DIALECTE_CONFIG` is pre-applied — no config argument needed.

See the [IO overview](/v2019C1/io/) for how these fit alongside `project.openDocument`.

## `project.import`

Parses one or more SCL files and stores their records into the project.

```ts
import { createSclProject } from '@dialecte/scl/v2019C1'

const project = await createSclProject({ storage: { type: 'local' } }).open('my-project')
const [{ documentId }] = await project.import([scdFile])
```

**Params**

| Param                 | Type      | Description                                                             |
| --------------------- | --------- | ----------------------------------------------------------------------- |
| `files`               | `File[]`  | Browser `File` objects to import                                        |
| `useCustomRecordsIds` | `boolean` | Keep IDs from the file instead of generating new ones. Default: `false` |

**Supported extensions** — `.fsd`, `.asd`, `.ssd`, `.scd`, `.isd`, `.xml`

**Returns** `Promise<{ documentId: string; recordCount: number }[]>` — one entry per successfully imported file.

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
