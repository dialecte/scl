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

Working with a coding agent? The package ships the `dialecte-scl` skill (SCL verbs, what the hooks
keep coherent); `npx @dialecte/cli skills sync` installs it with core's skills for your agent. See
[Working with AI agents](https://dialecte.github.io/core/guide/introduction/ai-agents).

## Step 1 — Create a project

`createSclProject` returns a [`Project`](https://dialecte.github.io/core/api/project) pre-configured with the SCL config, extensions, and hooks. Call `.open(name)` to initialize storage and hydrate state.

```ts
import { createSclProject } from '@dialecte/scl/v2019C1'

const project = await createSclProject({ storage: { type: 'local' } }).open('my-project')
```

## Step 2 — Import an SCL file

`project.importFile` parses one SCL file using a streaming SAX parser and stores it as a document in the project. It returns the imported document, with its generated `documentId` and what the import had to say about the file (`diagnostics`), or throws what failed.

Supports `.fsd`, `.asd`, `.ssd`, `.scd`, `.isd`, `.icd`, `.iid` and `.xml`.

```ts
// Browser File object — e.g. from an <input type="file"> or FileDialog
const { documentId, diagnostics } = await project.importFile(scdFile)
```

To import several files, one after the other, use `project.import`. A file that fails is its own entry; the others are still imported:

```ts
const entries = await project.import(Array.from(fileList))
// → [{ status: 'imported', fileName, documentId, recordCount, diagnostics }
//    | { status: 'failed', fileName, error }, ...]
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
const { documentId } = await project.importFile(scdFile)

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
