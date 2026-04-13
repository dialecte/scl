---
description: Scl type namespace reference for @dialecte/scl v2019C1 — pre-bound generics from @dialecte/core.
---

# Types

`@dialecte/scl` exports a `Scl` namespace that re-exports every `@dialecte/core` generic pre-applied to the SCL config. Import it once; use across your entire codebase without repeating the config type argument.

```ts
import type { Scl } from '@dialecte/scl/v2019C1'

function processFunction(record: Scl.TrackedRecord<'Function'>) { ... }
```

## Type table

| Type                             | Core equivalent                           | Description                                                                                                                        |
| -------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Scl.Query`                      | `Core.Query<Config>`                      | Read-only accessor. Passed as first arg to query extensions.                                                                       |
| `Scl.Transaction`                | `Core.Transaction<Config>`                | Staged mutation accessor. Passed as first arg to transaction extensions. Also extends `Query` — all read methods are available.    |
| `Scl.Context`                    | `Core.Context<Config>`                    | Raw DB handle, used when writing low-level hooks or standalone utilities.                                                          |
| `Scl.ElementsOf`                 | `Core.ElementsOf<Config>`                 | String union of all 210+ element tag names (`'SCL' \| 'Header' \| 'Substation' \| ...`).                                           |
| `Scl.Ref<E>`                     | `Core.Ref<Config, E>`                     | Lightweight stable reference to a record. Use as opaque handles when you need to track an element without holding the full record. |
| `Scl.TrackedRecord<E>`           | `Core.TrackedRecord<Config, E>`           | A persisted record as returned by query methods. Has `id`, `tagName`, `namespace`, `attributes`, and `children` (child refs).      |
| `Scl.RawRecord<E>`               | `Core.RawRecord<Config, E>`               | Record shape without DB tracking — used in hooks and before-persist operations.                                                    |
| `Scl.TreeRecord<E>`              | `Core.TreeRecord<Config, E>`              | Record with its full subtree inlined. Produced by `query.getTree()`, consumed by `tx.deepClone()`.                                 |
| `Scl.AttributesValueObjectOf<E>` | `Core.AttributesValueObjectOf<Config, E>` | Plain object of attribute name → value for element `E`. Useful for typed `attributes: { name: 'VL1', voltage: '110' }` literals.   |
| `Scl.AttributesOf<E>`            | `Core.AttributesOf<Config, E>`            | Union of valid attribute name strings for element `E`.                                                                             |
| `Scl.FullAttributeObjectOf<E>`   | `Core.FullAttributeObjectOf<Config, E>`   | All attributes (required and optional) as an object type.                                                                          |
| `Scl.ChildrenOf<E>`              | `Core.ChildrenOf<Config, E>`              | Union of element tag names that may appear as direct children of `E`.                                                              |
| `Scl.ParentsOf<E>`               | `Core.ParentsOf<Config, E>`               | Union of element tag names that may be a direct parent of `E`.                                                                     |
| `Scl.DescendantsOf<E>`           | `Core.DescendantsOf<Config, E>`           | All element tag names transitively reachable as descendants of `E`.                                                                |
| `Scl.AncestorsOf<E>`             | `Core.AncestorsOf<Config, E>`             | All element tag names that can appear as ancestors of `E`.                                                                         |
| `Scl.RootElementOf`              | `Core.RootElementOf<Config>`              | The root element tag name — `'SCL'`.                                                                                               |
| `Scl.SingletonElementsOf`        | `Core.SingletonElementsOf<Config>`        | Union of tag names that may appear at most once in a document (e.g. `'Header'`, `'DataTypeTemplates'`).                            |
| `Scl.Operation`                  | `Core.Operation<Config>`                  | A single staged DB operation (insert, update, delete). Used in hook return values.                                                 |
| `Scl.ParentRelationship<E>`      | `Core.ParentRelationship<Config, E>`      | `{ parent: Ref, child: Ref<E> }` — links a child to its parent.                                                                    |
| `Scl.ChildRelationship<E>`       | `Core.ChildRelationship<Config, E>`       | `{ parent: Ref, child: Ref<E> }` — links a parent to one of its children.                                                          |
| `Scl.Attribute<E>`               | `Core.Attribute<Config, E>`               | `{ name: AttributesOf<E>, value: string, namespace?: Namespace }`                                                                  |
| `Scl.QualifiedAttribute<E>`      | `Core.QualifiedAttribute<Config, E>`      | Attribute with full namespace qualification (uri + prefix). Used for `6-100` extension attributes.                                 |

## How types stay in sync with core

Each alias is defined in `src/v2019C1/config/hydrated.types.ts` as:

```ts
export namespace Scl {
	export type Query = Core.Query<Config>
	export type TrackedRecord<E extends ElementsOf> = Core.TrackedRecord<Config, E>
	// ...
}
```

When `@dialecte/core` introduces a new generic, add the corresponding alias to `hydrated.types.ts`. No codegen — one-line manual alias.

## Common usage

**Typing a function parameter:**

```ts
import type { Scl } from '@dialecte/scl/v2019C1'

async function processLNodes(
	query: Scl.Query,
	lnodes: Scl.TrackedRecord<'LNode'>[],
): Promise<void> { ... }
```

**Typed attribute literals:**

```ts
// Compiler checks that 'voltage' is a valid attribute on VoltageLevel
const attrs: Scl.AttributesValueObjectOf<'VoltageLevel'> = { name: 'VL1', voltage: '110' }
await tx.addChild(substation, { tagName: 'VoltageLevel', attributes: attrs })
```

**Narrowing the element union:**

```ts
// ElementsOf is a string union — use it as a constraint
function isScl<E extends Scl.ElementsOf>(tagName: E): tagName is E {
	return true
}
```
