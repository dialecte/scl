# SCL

Extension methods available when the chain is focused on the **SCL** root element.

## addEntryToHistory

Create or update the Header and History structure, then append a new `Hitem` entry. Handles all three cases: no Header, Header without History, and existing History with prior items.

```ts
chain.addEntryToHistory({
	filename: 'my-project.scd',
	header: { fileType: 'SCD', version: 'keep', tool: 'SET' },
	item: { who: 'John Doe', what: 'Initial creation' },
})
```

### Parameters

| Name                   | Type                    | Required | Description                                                                                                   |
| ---------------------- | ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `filename`             | `string`                | yes      | File name — used to derive the Header `id` if none is provided (lowercased, spaces → `_`, extension stripped) |
| `header.id`            | `string`                | no       | Explicit Header id. If omitted, derived from `filename`                                                       |
| `header.fileType`      | `string`                | yes      | SCL file type (e.g. `'SCD'`, `'SSD'`, `'FSD'`)                                                                |
| `header.nameStructure` | `string`                | no       | Name structure. Falls back to the default from the SCL definition                                             |
| `header.version`       | `'keep' \| 'increment'` | yes      | Whether to keep the current version or increment it                                                           |
| `header.tool`          | `string`                | yes      | Tool identifier (stored as `toolID` on Header)                                                                |
| `item.who`             | `string`                | yes      | Author of the change                                                                                          |
| `item.what`            | `string`                | yes      | Description of the change                                                                                     |

### Returns

`Chain<'SCL'>` — focus returns to the SCL root element, enabling further chaining.

### Behavior

1. **Header**: if no Header exists, creates one with the provided (or derived) id, toolID, fileType, nameStructure, initial version `'0'`, revision `'1'`, and a new UUID.
2. **History**: if no History exists under Header, creates one.
3. **Version/Revision**: reads the latest Hitem (via `getLatestHitem`). Computes the new version based on the `version` parameter (`'keep'` = same, `'increment'` = +1). Revision always increments.
4. **Hitem**: appends a new Hitem with `when` (formatted current timestamp), `who`, `what`, and the computed version/revision.
5. **History update**: updates the History element's `version` and `revision` attributes to match the new Hitem.
6. Returns focus to `SCL`.

### Example

```ts
// First entry — creates Header + History + Hitem
await dialecte
	.goToElement({ tagName: 'SCL' })
	.addEntryToHistory({
		filename: 'my project.scd',
		header: {
			fileType: 'SCD',
			version: 'keep',
			tool: 'SET',
		},
		item: {
			who: 'John Doe',
			what: 'Initial creation',
		},
	})
	.commit()
// Header id = 'my_project', version = '0', revision = '1'

// Subsequent entry — increments version
await dialecte
	.goToElement({ tagName: 'SCL' })
	.addEntryToHistory({
		filename: 'my project.scd',
		header: {
			fileType: 'SCD',
			version: 'increment',
			tool: 'SET',
		},
		item: {
			who: 'Jane Smith',
			what: 'Added substation',
		},
	})
	.commit()
// version = '1', revision = '2'
```
