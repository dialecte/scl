# Getting Started

## Installation

::: code-group

```sh [npm]
$ npm i @dialecte/scl
```

```sh [pnpm]
$ pnpm add @dialecte/scl
```

:::

## Step 1 — Import an SCL file

`importSclFiles` parses one or more SCL files using a streaming SAX parser and stores each one in its own IndexedDB database. It returns the list of database names created, one per file.

Supports `.fsd`, `.asd`, `.ssd`, `.scd`, `.isd`, and `.xml`.

```ts
import { importSclFiles } from '@dialecte/scl/v2019C1'

// Browser File object — e.g. from an <input type="file"> or FileDialog
const [databaseName] = await importSclFiles({ files: [scdFile] })
```

To import multiple files at once:

```ts
const databaseNames = await importSclFiles({ files: Array.from(fileList) })
// → ['station-a.scd', 'station-b.scd', ...]
```

## Step 2 — Open a document

Once a file is imported, connect to its database with `openSclDocument`. This returns a `Document` instance for all queries and mutations.

```ts
import { openSclDocument } from '@dialecte/scl/v2019C1'

const doc = openSclDocument({ storage: { type: 'local', databaseName } })
```

## Step 3 — Query the tree

Use `doc.query` to read records. Start from the root, then find descendants:

```ts
const root = await doc.query.getRoot()

// Find all Function elements anywhere in the tree
const { Function: functions } = await doc.query.findDescendants(root)

for (const fn of functions) {
	const { name } = await doc.query.getAttributes(fn)
	console.log(fn.id, name)
}
```

Get a specific record by ref:

```ts
const ied = await doc.query.getRecord({ tagName: 'IED', id: knownId })
console.log(ied?.tagName) // 'IED'
```

## Step 4 — Mutate the tree

Mutations happen inside a `transaction`. All operations are staged, then committed atomically when the callback returns.

```ts
const substation = await doc.query.getRecord({ tagName: 'Substation' })

await doc.transaction(async (tx) => {
	await tx.addChild(substation, {
		tagName: 'VoltageLevel',
		attributes: { name: 'VL1' },
	})
})
```

## Step 5 — Export to file

`exportSclFile` serialises the database back to XML. Pass `withDownload: true` to trigger a browser download automatically.

```ts
import { exportSclFile } from '@dialecte/scl/v2019C1'

const { xmlDocument } = await exportSclFile({
	databaseName,
	extension: '.scd',
	withDownload: true,
})
```

## Full example

```ts
import { importSclFiles, openSclDocument, exportSclFile } from '@dialecte/scl/v2019C1'

// 1. Import
const [databaseName] = await importSclFiles({ files: [scdFile] })

// 2. Open
const doc = openSclDocument({ storage: { type: 'local', databaseName } })

// 3. Query
const root = await doc.query.getRoot()
const { Function: functions } = await doc.query.findDescendants(root)

console.log(`Found ${functions.length} functions`)

// 4. Mutate
const substation = await doc.query.getRecord({ tagName: 'Substation' })

await doc.transaction(async (tx) => {
	await tx.addChild(substation, {
		tagName: 'Function',
		attributes: { name: 'Protection' },
	})
})

// 5. Export
await exportSclFile({ databaseName, extension: '.scd', withDownload: true })
```

## Next Steps

- [Custom extensions](/v2019C1/#adding-custom-extensions) - add your own query/transaction methods on top of the SCL built-ins
- [Writing Extensions](https://dialecte.github.io/core/guide/extensions/) - how to write extension functions and modules (core docs)
- [Document API](https://dialecte.github.io/core/api/document) - lifecycle, transactions, undo/redo
- [Query API](https://dialecte.github.io/core/api/query) - full reference for all read methods
- [Transaction API](https://dialecte.github.io/core/api/transaction) — full reference for all mutation methods
