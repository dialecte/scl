---
description: Template extension for @dialecte/scl v2019C1 — ensure canonical TEMPLATE substation structure.
---

# Template

The `template` extension provides a transaction helper to ensure the mandatory `TEMPLATE` structure required by some SCL engineering workflows.

## Transaction methods

Access via `tx.template` inside a `doc.transaction()` callback.

### `ensureSubstationTemplateStructure`

Ensures the following hierarchy exists under the root `SCL` element, creating each level if absent. Idempotent — safe to call multiple times.

```
SCL
└── Substation[name="TEMPLATE"]
    └── VoltageLevel[name="TEMPLATE"]
        └── Bay[name="TEMPLATE"]
```

```ts
ensureSubstationTemplateStructure(): Promise<{
  Substation: Scl.RawRecord<'Substation'>
  VoltageLevel: Scl.RawRecord<'VoltageLevel'>
  Bay: Scl.RawRecord<'Bay'>
}>
```

Returns refs to all three records — useful when you need to add children under the template structure in the same transaction.

```ts
await doc.transaction(async (tx) => {
	const { Bay } = await tx.template.ensureSubstationTemplateStructure()

	await tx.addChild(Bay, {
		tagName: 'Function',
		attributes: { name: 'Protection' },
	})
})
```

---

## Extraction methods

Both extraction methods open a cross-document transaction: they read from `sourceQuery` (the source SCD/SED) and write into the current `tx` (the target ASD/FSD).

### `extractToAsd`

Extracts an entire `Application` and its content into a new ASD file.

```ts
tx.template.extractToAsd(tx, {
  sourceQuery: Scl.Query,
  applicationRef: Scl.Ref<'Application'>,
  tool: string,
  who: string,
  nameStructure?: string,
}): Promise<void>
```

Steps:

1. Ensures TEMPLATE substation structure
2. Writes ASD history header (`fileType: 'ASD'`)
3. Clones the Application's full content tree into target
4. Runs post-extraction clean-up (orphan UUID refs, LNode bindings, prune empty containers)

```ts
await targetDoc.transaction(async (tx) => {
	await tx.template.extractToAsd(tx, {
		sourceQuery: sourceDoc.query,
		applicationRef: { tagName: 'Application', id: 'app-1' },
		tool: 'Tool name',
		who: 'user@example.com',
	})
})
```

### `extractToFsd`

Extracts a `Function` or `SubFunction` (with categories and data model) into a new FSD file.

```ts
tx.template.extractToFsd(tx, {
  sourceQuery: Scl.Query,
  functionRef: Scl.Ref<'Function'> | Scl.Ref<'SubFunction'>,
  tool: string,
  who: string,
  nameStructure?: string,
}): Promise<void>
```

Steps:

1. Ensures TEMPLATE substation structure
2. Writes FSD history header (`fileType: 'FSD'`)
3. Clones the Function tree with categories and DataTypeTemplates via `cloneFunctionWithCategories`
4. Applies FSD-specific exclusion filters (e.g. IED-bound elements)
5. Runs post-extraction clean-up

```ts
await targetDoc.transaction(async (tx) => {
	await tx.template.extractToFsd(tx, {
		sourceQuery: sourceDoc.query,
		functionRef: { tagName: 'Function', id: 'func-1' },
		tool: 'Tool name',
		who: 'user@example.com',
	})
})
```

### Shared extraction bricks

Both methods compose from shared building blocks in `shared/`:

| Brick                         | Responsibility                                                          |
| ----------------------------- | ----------------------------------------------------------------------- |
| `cloneFunctionWithCategories` | Clone Function tree + referenced FunctionCategories + DataTypeTemplates |
| `cloneApplicationContent`     | Clone Application content tree into target structure                    |
| `cloneReferencedRecords`      | Clone missing referenced records (dedup against target)                 |
| `extractDataModel`            | Extract LNode-referenced DataTypeTemplates type chains                  |
| `postExtractionCleanup`       | Orphan UUID refs + LNode bindings + prune empty containers              |
