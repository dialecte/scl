# SubFunction

Extension methods available when the chain is focused on a **SubFunction** element.

## extractTo

Extract a SubFunction from one SCL document into another, **promoting it to a Function** in the target. Creates the required substation structure and deep-clones the SubFunction tree with its tag name rewritten to `Function`.

```ts
const { sourceChain, targetChain } = await chain.extractTo({
	target: {
		chain: targetDialecte.goToElement({ tagName: 'SCL' }),
		level: 'Substation',
	},
})
```

### Parameters

| Name           | Type                                      | Required | Description                                                      |
| -------------- | ----------------------------------------- | -------- | ---------------------------------------------------------------- |
| `target.chain` | `Chain<'SCL'>`                            | yes      | Chain focused on the SCL root of the **target** document         |
| `target.level` | `'Substation' \| 'Bay' \| 'VoltageLevel'` | no       | Substation hierarchy level to attach to. Default: `'Substation'` |

### Returns

```ts
Promise<{
	sourceChain: Chain<'SubFunction'>
	targetChain: Chain<'Function'>
}>
```

`sourceChain` remains focused on the original SubFunction. `targetChain` is focused on the newly created Function (promoted from SubFunction) in the target document.

### Behavior

1. **Tree extraction**: gets the full SubFunction tree from the source, excluding domain-specific children: `LNodeInputs`, `LNodeOutputs`, `DOS`, `FunctionSclRef`, `Variable`, `GeneralEquipment`, `ConductingEquipment`, `ProcessResources`, `PowerSystemRelations`, `Labels`, `BehaviorDescription`.
2. **Promotion**: rewrites the root element's `tagName` from `SubFunction` to `Function`.
3. **Target structure**: ensures the target has the required substation hierarchy via `getOrCreateSubstationSectionRequiredStructure`.
4. **Clone**: deep-clones the promoted Function tree into the target at the specified level.

### Difference from Function.extractTo

| Aspect             | `Function.extractTo`                        | `SubFunction.extractTo`      |
| ------------------ | ------------------------------------------- | ---------------------------- |
| Source element     | `Function`                                  | `SubFunction`                |
| Target element     | `Function` (same tag)                       | `Function` (promoted)        |
| `extension` param  | Required — controls excluded children       | Not needed — always excludes |
| Category cloning   | Yes — clones FunctionCategory references    | No                           |
| Data model cloning | Yes — resolves and clones DataTypeTemplates | No                           |

### Example

```ts
const sourceDialecte = createSclDialecte({ databaseName: 'source' })
const targetDialecte = createSclDialecte({ databaseName: 'target' })

// Extract a SubFunction, promoting it to Function
const { sourceChain, targetChain } = await sourceDialecte
	.goToElement({ tagName: 'SubFunction', id: 'subfunc-001' })
	.extractTo({
		target: {
			chain: targetDialecte.goToElement({ tagName: 'SCL' }),
			level: 'Bay',
		},
	})

// targetChain is focused on the new Function in the target
await targetChain.commit()
```
