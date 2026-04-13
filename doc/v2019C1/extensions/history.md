---
description: History extension for @dialecte/scl v2019C1 — query and manage SCL Header/History/Hitem records.
---

# History

The `history` extension reads and writes the `Header > History > Hitem` chain. It handles version/revision incrementing and timestamp formatting automatically.

## Query methods

Access via `doc.query.history`.

### `getSortedHitems`

Returns all `Hitem` records sorted by `version` then `revision`, ascending. Returns an empty array if no `History` element exists.

```ts
getSortedHitems(): Promise<Scl.TrackedRecord<'Hitem'>[]>
```

```ts
const hitems = await doc.query.history.getSortedHitems()
// → [Hitem(v0,r1), Hitem(v0,r2), Hitem(v1,r3), ...]
```

### `getLatestHitem`

Returns the last item from `getSortedHitems` — highest version, then highest revision. Returns `undefined` if the `History` element is absent or empty.

```ts
getLatestHitem(): Promise<Scl.TrackedRecord<'Hitem'> | undefined>
```

```ts
const latest = await doc.query.history.getLatestHitem()
const version = latest?.attributes.find((a) => a.name === 'version')?.value
```

## Transaction methods

Access via `tx.history` inside a `doc.transaction()` callback.

### `addHistoryEntry`

Ensures `Header` and `History` exist, increments version/revision relative to the last `Hitem`, and appends a new `Hitem`. Idempotent at the structural level — will not create duplicate containers.

```ts
addHistoryEntry(params: {
  filename: string
  header: {
    id?: string
    fileType: Scl.AttributesValueObjectOf<'Header'>['fileType']
    nameStructure?: Scl.AttributesValueObjectOf<'Header'>['nameStructure']
    version: 'keep' | 'increment'
    tool: Scl.AttributesValueObjectOf<'Header'>['toolID']
  }
  item: {
    who: Scl.AttributesValueObjectOf<'Hitem'>['who']
    what: Scl.AttributesValueObjectOf<'Hitem'>['what']
    why: Scl.AttributesValueObjectOf<'Hitem'>['why']
  }
}): Promise<void>
```

`header.version`:

- `'keep'` - version stays the same as the last `Hitem`
- `'increment'` - version increments by 1; revision resets per last entry

`header.id` defaults to the filename without extension, lowercased, with spaces replaced by `_`.

```ts
await doc.transaction(async (tx) => {
	await tx.history.addHistoryEntry({
		filename: 'station-a.scd',
		header: {
			fileType: 'SCD',
			version: 'increment',
			tool: 'MySETool',
		},
		item: {
			who: 'alice',
			what: 'Updated Function binding',
			why: 'Engineering change order #42',
		},
	})
})
```
