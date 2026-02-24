# Extensions

Extensions are **domain-specific methods** injected into the chain API. When the chain's focus is on a given element, extension methods for that element become available alongside the core chain methods.

## How it works

Extensions are registered at dialecte creation and bound to specific element types. When you navigate to an element, its extensions appear as chainable methods:

```ts
// Focus on SCL → addEntryToHistory is available
await dialecte
	.goToElement({ tagName: 'SCL' })
	.addEntryToHistory({
		filename: 'my-project.scd',
		header: { fileType: 'SCD', version: 'keep', tool: 'SET' },
		item: { who: 'John', what: 'Initial creation' },
	})
	.commit()

// Focus on History → getSortedHitems, getLatestHitem are available
const hitems = await dialecte.goToElement({ tagName: 'History' }).getSortedHitems()
```

## Available extensions

### [SCL](./scl)

Methods available when focused on the `SCL` root element.

| Method                                         | Description                                        |
| ---------------------------------------------- | -------------------------------------------------- |
| [`addEntryToHistory`](./scl#addentrytohistory) | Create/update Header, History, and add a new Hitem |

### [History](./history)

Methods available when focused on a `History` element.

| Method                                         | Description                                 |
| ---------------------------------------------- | ------------------------------------------- |
| [`getSortedHitems`](./history#getsortedhitems) | Get all Hitems sorted by version + revision |
| [`getLatestHitem`](./history#getlatesthitem)   | Get the most recent Hitem                   |

### [DataTypeTemplates](./data-type-templates)

Methods available when focused on a `DataTypeTemplates` element.

| Method                                                       | Description                                             |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| [`resolveDataModel`](./data-type-templates#resolvedatamodel) | Resolve the full type hierarchy for given LNodeType ids |

### [Function](./function)

Methods available when focused on a `Function` element.

| Method                              | Description                                |
| ----------------------------------- | ------------------------------------------ |
| [`extractTo`](./function#extractto) | Extract a Function to another FSD document |

### [SubFunction](./sub-function)

Methods available when focused on a `SubFunction` element.

| Method                                  | Description                                                          |
| --------------------------------------- | -------------------------------------------------------------------- |
| [`extractTo`](./sub-function#extractto) | Extract a SubFunction as a promoted Function to another FSD document |
