---
description: Signature extension for @dialecte/scl v2019C1 — structural, id-independent signatures of element subtrees for content-addressing.
---

# Signature

The `signature` extension computes a **structural, id-independent** signature of an element subtree. Two subtrees with the same shape, attributes and (optionally) resolved references produce the same signature, regardless of their `id`/`uuid`. It is the content-addressing primitive behind `dataModel.importTypes` (type reuse/fork) and is reusable by any caller that needs to compare elements by content.

```ts
import { signature } from '@dialecte/scl/v2019C1'
```

## Query methods

Access via `doc.query.signature`.

### `elementSignature`

Serializes an element subtree into a canonical string, ignoring identity attributes.

```ts
signature.query.elementSignature(
  query: Scl.Query | Scl.Transaction,
  params: {
    ref: Scl.Ref<Scl.ElementsOf>
    resolveReferences?: boolean       // default false
    ignoreAttributes?: string[]       // default ['id', 'uuid']
  },
): Promise<string>
```

- **`ignoreAttributes`** — attributes dropped before hashing (default `id`, `uuid`), so identity differences never affect the signature.
- **`resolveReferences`** — when `true`, both **id references** (`lnType`/`type`, via `TYPE_ID_REFERENCE_PAIRS`) and **uuid references** (via `UUID_REFERENCE_PAIRS`, path companion attribute skipped) are folded into the _referenced element's_ signature rather than compared by their raw id/uuid value. This makes two types that point at structurally-identical-but-differently-named children compare equal. Cycle-safe.

```ts
// Two LNodeTypes that differ only in id but are otherwise identical:
const a = await doc.query.signature.elementSignature(query, {
	ref: { tagName: 'LNodeType', id: 'CSWI_A' },
	resolveReferences: true,
})
const b = await doc.query.signature.elementSignature(query, {
	ref: { tagName: 'LNodeType', id: 'CSWI_B' },
	resolveReferences: true,
})
a === b // → true (same structure, ids ignored, child type-refs resolved)
```

Used by `dataModel.importTypes`: the signature of an incoming type is matched against an index of the target's existing type signatures to decide **reuse** (match), **preserve** (no match, id free) or **fork** (no match, id taken).
