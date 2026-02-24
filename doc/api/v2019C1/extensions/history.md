# History

Extension methods available when the chain is focused on a **History** element.

## getSortedHitems

Retrieve all `Hitem` children of the current History, sorted by version then revision in ascending order.

```ts
const hitems = await chain.getSortedHitems()
```

### Parameters

None.

### Returns

`Promise<ChainRecord<'Hitem'>[]>` — sorted array of Hitem records. Empty array if no Hitems exist.

### Behavior

- Fetches all `Hitem` descendants via `findDescendants`.
- Sorts by `version` (numeric, ascending), then by `revision` (numeric, ascending) as tiebreaker.
- Missing version/revision values are treated as `0`.

### Example

```ts
const hitems = await dialecte.goToElement({ tagName: 'History' }).getSortedHitems()

// hitems = [
//   { version: '0', revision: '1', ... },
//   { version: '0', revision: '2', ... },
//   { version: '1', revision: '1', ... },
// ]
```

## getLatestHitem

Retrieve the most recent `Hitem` — the one with the highest version and revision.

```ts
const latest = await chain.getLatestHitem()
```

### Parameters

None.

### Returns

`Promise<ChainRecord<'Hitem'> | undefined>` — the latest Hitem, or `undefined` if the History is empty.

### Behavior

- Delegates to `getSortedHitems` and returns the last element.

### Example

```ts
const latest = await dialecte.goToElement({ tagName: 'History' }).getLatestHitem()

if (latest) {
	// latest.attributes contains version, revision, who, what, when
}
```
