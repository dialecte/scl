---
description: Reference for @dialecte/scl v2019C1 IO functions — importSclFiles and exportSclFile.
---

# IO Reference

SCL-specific wrappers around `@dialecte/core` IO. `SCL_DIALECTE_CONFIG` is applied internally — no config argument needed.

See the [IO overview](/v2019C1/io/) for how these fit alongside `openSclDocument`.

## `importSclFiles`

Parses one or more SCL files and stores their records into new database instances.

```ts
import { importSclFiles } from '@dialecte/scl/v2019C1'

const [databaseName] = await importSclFiles({ files: [scdFile] })
```

**Params**

| Param                 | Type      | Description                                                             |
| --------------------- | --------- | ----------------------------------------------------------------------- |
| `files`               | `File[]`  | Browser `File` objects to import                                        |
| `useCustomRecordsIds` | `boolean` | Keep IDs from the file instead of generating new ones. Default: `false` |

**Supported extensions** — `.fsd`, `.asd`, `.ssd`, `.scd`, `.isd`, `.xml`

**Returns** `Promise<string[]>` — one database name per successfully imported file.

---

## `exportSclFile`

Serializes a stored database back to an SCL file. Optionally triggers a browser download.

```ts
import { exportSclFile } from '@dialecte/scl/v2019C1'

const { xmlDocument, filename } = await exportSclFile({
	databaseName,
	extension: '.scd',
})
```

**Params**

| Param             | Type                                                       | Description                                                   |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| `databaseName`    | `string`                                                   | Database name as returned by `importSclFiles`                 |
| `extension`       | `'.fsd' \| '.asd' \| '.ssd' \| '.scd' \| '.isd' \| '.xml'` | Output file extension                                         |
| `withDownload`    | `boolean`                                                  | Trigger browser file download. Default: `false`               |
| `withDatabaseIds` | `boolean`                                                  | Include internal database IDs in the output. Default: `false` |

**Returns** `Promise<{ xmlDocument: XMLDocument; filename: string }>`
