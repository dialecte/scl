---
description: Presentation extension for @dialecte/scl v2019C1 -- human-readable element titles for UI rendering.
---

# Presentation

The `presentation` extension provides query helpers to derive display strings from SCL elements -- used for tree labels, breadcrumbs, and other UI rendering.

## Query methods

Access via `doc.query.presentation`.

### `extractElementTitle`

Returns a human-readable title for any SCL element.

```ts
const title = await doc.query.presentation.extractElementTitle(ref)
// string
```

**Resolution strategy (in order):**

1. Title-field override map (e.g. `LNode` -> `prefix + lnClass + lnInst`)
2. First matching `identityFields` entry (`name` > `id` > first field)
3. Fallback: `tagName`

### Title-field overrides

Some elements require specific attribute combinations or separators:

| Element            | Fields                  | Separator |
| ------------------ | ----------------------- | --------- |
| `LNode`            | prefix, lnClass, lnInst | (none)    |
| `LN` / `LN0`       | prefix, lnClass, inst   | (none)    |
| `LDevice`          | inst                    | -         |
| `ConnectedAP`      | iedName, apName         | `/`       |
| `GSE` / `SMV`      | ldInst, cbName          | `/`       |
| `Private`          | type                    | -         |
| `EnumVal`          | ord                     | -         |
| `ConnectivityNode` | pathName                | -         |

### Example

```ts
const doc = project.openDocument(documentId)

const ied = await doc.query.getRecord({ tagName: 'IED', id: 'ied-1' })
const title = await doc.query.presentation.extractElementTitle(ied)
// "IED_A"

const lnode = await doc.query.getRecord({ tagName: 'LNode', id: 'lnode-1' })
const lnTitle = await doc.query.presentation.extractElementTitle(lnode)
// "PXCBR1"
```
