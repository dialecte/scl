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

## Step 2 — Create a dialecte instance

Once a file is imported, connect to its database with `createSclDialecte`. This is how you create an instance for all queries and mutations.

```ts
import { createSclDialecte } from '@dialecte/scl/v2019C1'

const dialecte = await createSclDialecte({ databaseName })
```

## Step 3 — Query the tree

Use `fromRoot()` to start a chain from the root `SCL` element, then navigate down using `findDescendants`.

```ts
// Find all Function elements anywhere in the tree
const { Function: functions } = await dialecte.fromRoot().findDescendants({ tagName: 'Function' })

for (const functionElement of functions) {
	const { name } = await dialecte
		.fromElement({ tagName: functionElement.tagName, id: functionElement.id })
		.getAttributesValues()
	console.log(functionElement.id, name)
}
```

Jump directly to a known element with `fromElement`:

```ts
const { currentFocus } = await dialecte.fromElement({ tagName: 'IED', id: knownId }).getContext()

console.log(currentFocus.tagName) // 'IED'
```

## Step 4 — Mutate the tree

Mutations are staged on a chain and written atomically with `.commit()`.

```ts
await dialecte
	.fromRoot()
	.goToElement({ tagName: 'Substation' })
	.addChild({ tagName: 'VoltageLevel', attributes: { name: 'VL1' } })
	.commit()
```

The chain is immutable — each method returns a new chain, so you can branch and compose safely.

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
import { importSclFiles, createSclDialecte, exportSclFile } from '@dialecte/scl/v2019C1'

// 1. Import
const [databaseName] = await importSclFiles({ files: [scdFile] })

// 2. Connect
const dialecte = await createSclDialecte({ databaseName })

// 3. Query
const { Function: functions } = await dialecte.fromRoot().findDescendants({ tagName: 'Function' })

console.log(`Found ${functions.length} functions`)

// 4. Mutate
await dialecte
	.fromRoot()
	.goToElement({ tagName: 'Substation' })
	.addChild({ tagName: 'Function', attributes: { name: 'Protection' } })
	.commit()

// 5. Export
await exportSclFile({ databaseName, extension: '.scd', withDownload: true })
```

## Next Steps

- [Writing Extensions](https://dialecte.github.io/core/guide/extensions/) — how extensions work under the hood and how to write your own (core docs)
