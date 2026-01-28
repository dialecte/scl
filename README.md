# SCL SDK

A TypeScript SDK for working with SCL (Substation Configuration Language) files based on IEC 61850 standards. This package provides a type-safe, fluent API for creating, reading, updating, and managing SCL document structures with integrated IndexedDB storage.

## Features

- **Type-Safe API**: Full TypeScript support with intelligent type narrowing based on element context
- **Fluent Builder Pattern**: Chain operations to build complex SCL structures intuitively
- **Version Support**: Built-in support for multiple IEC 61850 versions (e.g., v2019C1)
- **IndexedDB Integration**: Client-side persistence with Dexie.js for browser-based applications
- **Lazy Evaluation**: Operations are staged and only executed when explicitly committed
- **Snapshot & Observable**: Get snapshots of pending changes or observe live database updates
- **Standards Compliance**: Follows IEC 61850 SCL schema definitions and element relationships

## Installation

```bash
pnpm add @septkit/sclsdk
```

## Example of usage

```ts
const sdkInstance = sdk({ databaseName: 'scl-sdk-database', version: 'v2019C1' })

const api = sdkInstance.api
const database = sdkInstance.database
const standard = sdkInstance.standard

// Build a chain without executing - returns a builder
const builder = api
	.fromRoot()
	.addChild({
		tagName: 'IED',
		attributes: {
			type: 'some-type',
			name: 'some-name',
		},
		setFocus: true,
	})
	.addChild({
		tagName: 'AccessPoint',
		attributes: { name: 'AP1' },
	})
	.addChild({ tagName: 'Labels', attributes: { desc: '' } })

// Execute certain commands
const snapshot = await builder.getSnapshot()
const context = await builder.getContext()

// continue building
const builder2 = builder.addChild({
	tagName: 'Private',
	attributes: { type: 'some-type', source: 'some-source' },
})

// commit
await builder2.commit()

// One can also do this :

sdk({ databaseName: 'scl-sdk-database', version: 'v2019C1' })
	.api.fromElement({ tagName: 'LDevice', id: 'some-id' })
	.goToParent()
	.goToParent()
	.addChild({ tagName: 'Server', attributes: {} })
	.commit()

// Or this :

const allLDevicesObservable = await api.getObservable({ tagName: 'LDevice' })

// Or also that :

const substationElement = api.fromElement({ tagName: 'Substation', id: 'some-id' })
const substationDescendants = await substationElement.getDescendants({ depth: 2 })
```
