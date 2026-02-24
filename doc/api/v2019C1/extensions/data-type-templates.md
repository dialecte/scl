# DataTypeTemplates

Extension methods available when the chain is focused on a **DataTypeTemplates** element.

## resolveDataModel

Resolve the complete type hierarchy for a set of LNodeType ids. Traverses `LNodeType → DO → DOType → DA/BDA → DAType/EnumType` recursively, collecting all referenced types.

```ts
const model = await chain.resolveDataModel({ lnTypes: ['LN_Type_1', 'LN_Type_2'] })
```

### Parameters

| Name      | Type       | Required | Description                                         |
| --------- | ---------- | -------- | --------------------------------------------------- |
| `lnTypes` | `string[]` | yes      | Array of LNodeType `id` attribute values to resolve |

### Returns

```ts
Promise<{
	LNodeType: TreeRecord<'LNodeType'>[]
	DOType: TreeRecord<'DOType'>[]
	DAType: TreeRecord<'DAType'>[]
	EnumType: TreeRecord<'EnumType'>[]
}>
```

All types are returned as `TreeRecord` (element + nested children tree), deduplicated by `id`.

### Behavior

For each LNodeType id:

1. Fetches the `LNodeType` tree (including `DO` children) via `getTree`.
2. For each `DO` child, reads its `type` attribute to find the referenced `DOType`.
3. For each `DOType`, recursively resolves `DA` children:
   - `bType: 'Enum'` → fetches the referenced `EnumType`
   - `bType: 'Struct'` → fetches the referenced `DAType` and recurses into its `BDA` children
4. All types are deduplicated — if a type id was already resolved, it is skipped.

### Example

```ts
const { LNodeType, DOType, DAType, EnumType } = await dialecte
	.goToElement({ tagName: 'DataTypeTemplates' })
	.resolveDataModel({
		lnTypes: ['PTOC_Type'],
	})

// LNodeType = [{ tagName: 'LNodeType', id: '...', tree: [DO, DO, ...] }]
// DOType    = [{ tagName: 'DOType', id: '...', tree: [DA, DA, ...] }]
// DAType    = [{ tagName: 'DAType', id: '...', tree: [BDA, ...] }]
// EnumType  = [{ tagName: 'EnumType', id: '...', tree: [EnumVal, ...] }]
```
