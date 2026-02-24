# Function

Extension methods available when the chain is focused on a **Function** element.

## extractTo

Extract a Function (with its categories and data model) from one SCL document into another. Creates the required substation structure in the target, deep-clones the Function tree, its FunctionCategory references, and all referenced DataTypeTemplates.

```ts
const { sourceChain, targetChain } = await chain.extractTo({
	target: {
		extension: 'FSD',
		chain: targetDialecte.goToElement({ tagName: 'SCL' }),
		level: 'Substation',
	},
})
```

### Parameters

| Name               | Type                                      | Required | Description                                                       |
| ------------------ | ----------------------------------------- | -------- | ----------------------------------------------------------------- |
| `target.extension` | `'FSD' \| 'ASD' \| 'ISD'`                 | yes      | Target file extension type — controls which children are excluded |
| `target.chain`     | `Chain<'SCL'>`                            | yes      | Chain focused on the SCL root of the **target** document          |
| `target.level`     | `'Substation' \| 'Bay' \| 'VoltageLevel'` | no       | Substation hierarchy level to attach to. Default: `'Substation'`  |

### Returns

```ts
Promise<{
	sourceChain: Chain<'Function'>
	targetChain: Chain<'Function'>
}>
```

Both chains are returned for further operations — `sourceChain` remains focused on the original Function, `targetChain` is focused on the cloned Function in the target document.

### Behavior

1. **Tree extraction**: gets the full Function tree from the source. When `extension` is `'FSD'`, strips domain-specific children: `LNodeInputs`, `LNodeOutputs`, `DOS`, `FunctionSclRef`, `Variable`, `GeneralEquipment`, `ConductingEquipment`, `ProcessResources`, `PowerSystemRelations`, `Labels`, `BehaviorDescription`.
2. **Target structure**: ensures the target has the required substation hierarchy (Substation / VoltageLevel / Bay) via `getOrCreateSubstationSectionRequiredStructure`.
3. **Function clone**: deep-clones the Function tree into the target at the specified level.
4. **Category clone**: finds all `FunctionCategory → SubCategory → FunctionCatRef` trees that reference the source Function (by `uuid`), and deep-clones them into the target.
5. **Data model clone**: resolves all `LNode` references in the source Function, calls `resolveDataModel` to collect the full type hierarchy (`LNodeType`, `DOType`, `DAType`, `EnumType`), and deep-clones them into the target's `DataTypeTemplates`.

### Example

```ts
const sourceDialecte = createSclDialecte({ databaseName: 'source' })
const targetDialecte = createSclDialecte({ databaseName: 'target' })

// Extract a Function to an FSD document
const { sourceChain, targetChain } = await sourceDialecte
	.goToElement({ tagName: 'Function', id: 'func-001' })
	.extractTo({
		target: {
			extension: 'FSD',
			chain: targetDialecte.goToElement({ tagName: 'SCL' }),
			level: 'Substation',
		},
	})

// targetChain is focused on the cloned Function
await targetChain.commit()
```
