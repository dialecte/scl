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
