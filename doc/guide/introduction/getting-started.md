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

## Step 1 — Create a project

`createSclProject` returns a [`Project`](https://dialecte.github.io/core/api/project) pre-configured with the SCL config, extensions, and hooks. Call `.open(name)` to initialize storage and hydrate state.

```ts
import { createSclProject } from '@dialecte/scl/v2019C1'

const project = await createSclProject({ storage: { type: 'local' } }).open('my-project')
```

## Step 2 — Import an SCL file

`project.import` parses one or more SCL files using a streaming SAX parser and stores each one as a document in the project. It returns one entry per file, including the generated `documentId`.

Supports `.fsd`, `.asd`, `.ssd`, `.scd`, `.isd`, `.icd`, and `.xml`.

```ts
// Browser File object — e.g. from an <input type="file"> or FileDialog
const [{ documentId }] = await project.import([scdFile])
```

To import multiple files at once:

```ts
const imported = await project.import(Array.from(fileList))
// → [{ documentId, recordCount }, ...]
```

## Step 3 — Open a document

Once a file is imported, get a per-file `Document` for queries and mutations with `project.openDocument`.

```ts
const doc = project.openDocument(documentId)
```

## Step 4 — Query the tree

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

## Step 5 — Mutate the tree

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

## Step 6 — Export to file

`project.export` serialises a document back to XML. Pass `withDownload: true` to trigger a browser download automatically.

```ts
const { xmlDocument } = await project.export(documentId, { withDownload: true })
```

## Full example

```ts
import { createSclProject } from '@dialecte/scl/v2019C1'

// 1. Project
const project = await createSclProject({ storage: { type: 'local' } }).open('my-project')

// 2. Import
const [{ documentId }] = await project.import([scdFile])

// 3. Open
const doc = project.openDocument(documentId)

// 4. Query
const root = await doc.query.getRoot()
const { Function: functions } = await doc.query.findDescendants(root)

console.log(`Found ${functions.length} functions`)

// 5. Mutate
const substation = await doc.query.getRecord({ tagName: 'Substation' })

await doc.transaction(async (tx) => {
	await tx.addChild(substation, {
		tagName: 'Function',
		attributes: { name: 'Protection' },
	})
})

// 6. Export
await project.export(documentId, { withDownload: true })
```

## Next Steps

- [Custom extensions](/v2019C1/#adding-custom-extensions) - add your own query/transaction methods on top of the SCL built-ins
- [Writing Extensions](https://dialecte.github.io/core/guide/extensions/) - how to write extension functions and modules (core docs)
- [Document API](https://dialecte.github.io/core/api/document) - lifecycle, transactions, undo/redo
- [Query API](https://dialecte.github.io/core/api/query) - full reference for all read methods
- [Transaction API](https://dialecte.github.io/core/api/transaction) — full reference for all mutation methods
