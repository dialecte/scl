---
description: API reference for @dialecte/scl v2019C1 — extensions, Scl type namespace, and test helpers.
---

# v2019C1

`@dialecte/scl/v2019C1` is the IEC 61850-6 v2019C1 dialecte. It builds on the `@dialecte/core` Document/Query/Transaction API and adds SCL-specific extensions, hooks, and IO.

The core Query and Transaction APIs are documented at [dialecte.github.io/core](https://dialecte.github.io/core/api/).

## Instantiation

```ts
import { createSclProject } from '@dialecte/scl/v2019C1'

const project = await createSclProject({ storage: { type: 'local' } }).open('my-project')
const [{ documentId }] = await project.import([scdFile])
const doc = project.openDocument(documentId)
```

`createSclProject` returns a [`Project`](https://dialecte.github.io/core/api/project) pre-configured with the SCL config, extensions, and hooks. `project.openDocument(id)` returns a `Document` typed with the full SCL element set and all registered extensions.

## Adding custom extensions

Pass your own extension modules via the `extensions` parameter. They are merged on top of the SCL built-ins — no direct core dependency needed.

```ts
import { createSclProject } from '@dialecte/scl/v2019C1'
import { myFeature } from './extensions/my-feature'

const project = await createSclProject({
	storage: { type: 'local' },
	extensions: { myFeature },
}).open('my-project')

const doc = project.openDocument(documentId)

// SCL built-ins + your extensions — all typed:
const hitems = await doc.query.history.getSortedHitems()
const result = await doc.query.myFeature.doSomething()
```

Each entry in `extensions` must follow the `{ query?, transaction? }` shape. See [Writing Extensions](https://dialecte.github.io/core/guide/extensions/) for the authoring guide.

## Extensions

Domain-specific methods are bound onto every `doc.query` and `tx` instance under named groups:

| Module      | Namespace on query/tx | Methods                                                                                                                                                                                          | Reference                                                                                                                                                                     |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `history`   | `doc.query.history`   | `getSortedHitems`, `getLatestHitem`                                                                                                                                                              | [History](/v2019C1/extensions/history)                                                                                                                                        |
| `history`   | `tx.history`          | `addEntry`                                                                                                                                                                                       | [History](/v2019C1/extensions/history)                                                                                                                                        |
| `dataModel` | `doc.query.dataModel` | `resolve`, `isLNodeLocked`                                                                                                                                                                       | [Data Model](/v2019C1/extensions/data-model)                                                                                                                                  |
| `dataModel` | `tx.dataModel`        | `importTypes`, `unlockLNode`                                                                                                                                                                     | [Data Model](/v2019C1/extensions/data-model)                                                                                                                                  |
| `info`      | `doc.query.info`      | `of`, `ofEach`                                                                                                                                                                                   | [Info](/v2019C1/extensions/info)                                                                                                                                              |
| `lifecycle` | `doc.query.lifecycle` | `report`, `checkTemplateUuids`, `classifyIeds`                                                                                                                                                   | [Update](/v2019C1/extensions/update)                                                                                                                                          |
| `lifecycle` | `tx.lifecycle`        | `extract.{fsd,asd,ssd,ensureSubstationTemplateStructure}`, `instantiate.{fsd,asd,ssd,resolveTargetStructure}`, `update.{fsd,asd,ssd}`, `transplant.deep`, `apply`, `makeUnique`                  | [Extract](/v2019C1/extensions/extract) · [Instantiate](/v2019C1/extensions/instantiate) · [Update](/v2019C1/extensions/update) · [Transplant](/v2019C1/extensions/transplant) |
| `identity`  | `doc.query.identity`  | `resolveIdentity`, `identityEquals`                                                                                                                                                              | [Identity](/v2019C1/extensions/identity)                                                                                                                                      |
| `identity`  | `tx.identity`         | `writeIdentity`, `restoreClonedUuids`                                                                                                                                                            | [Identity](/v2019C1/extensions/identity)                                                                                                                                      |
| `reference` | `doc.query.reference` | `buildElementPath`, `buildReferencePath`, `buildMappedLNodePath`, `resolveElementPath`, `resolveReferencePath`, `resolveMappedLNode`, `resolveMappedData`, `findRefsPointingTo`, `getProvenance` | [Reference](/v2019C1/extensions/reference)                                                                                                                                    |
| `reference` | `tx.reference`        | `setMappedData`, `applyTypeIdRemap`, `applyUuidRemap`, `writeProvenance`                                                                                                                         | [Reference](/v2019C1/extensions/reference)                                                                                                                                    |
| `signature` | `doc.query.signature` | `elementSignature`                                                                                                                                                                               | [Signature](/v2019C1/extensions/signature)                                                                                                                                    |
| `cleanUp`   | `tx.cleanUp`          | `orphanUuidRefs`, `resetLNode`, `pruneEmptyContainers`                                                                                                                                           | [Clean-up](/v2019C1/extensions/clean-up)                                                                                                                                      |

## Reading attributes of a record you hold

`readAttribute` and `readAttributes` read an SCL record you already hold (raw, tracked or tree) the way `query.getAttribute` / `query.getAttributes` read it, with no query and no configuration to pass: same `namespace`, `defaults` and `fullObject` options, same results, synchronous. Use them in an import pass or a pure function; inside a transaction read through `tx.getAttribute(s)`, which sees the staged writes.

```ts
import { readAttribute, readAttributes } from '@dialecte/scl/v2019C1'

readAttribute({ record: lnode, name: 'lnClass' }) // 'XCBR'
readAttribute({ record: lnode, name: 'iedName' }) // 'None' when absent: the schema default
readAttribute({ record: lnode, name: 'iedName', defaults: 'none', fullObject: true }) // undefined when absent
readAttribute({ record: root, name: 'revision', namespace: 'v2019C1' }) // 'C': eIEC61850-6-100:revision
readAttributes({ record: lnode, defaults: 'none' }) // the stored attributes only
```

In the default view an absent attribute reads its schema value (`'None'` for an LNode's `iedName`), `''` when it has none. Only `{ defaults: 'none', fullObject: true }` returns `undefined` for it, the only way to tell it from one written empty.

## `Scl` type namespace

All types from `@dialecte/core` are re-exported pre-bound to the SCL config under the `Scl` namespace. Import once, use everywhere:

```ts
import type { Scl } from '@dialecte/scl/v2019C1'
```

| Type                             | Equivalent core generic                   | Description                                                                   |
| -------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `Scl.Query`                      | `Core.Query<Config>`                      | Read-only document accessor                                                   |
| `Scl.Transaction`                | `Core.Transaction<Config>`                | Staged mutation accessor                                                      |
| `Scl.Context`                    | `Core.Context<Config>`                    | Raw DB context                                                                |
| `Scl.ElementsOf`                 | `Core.ElementsOf<Config>`                 | Union of all 210+ element tag names                                           |
| `Scl.Ref<E>`                     | `Core.Ref<Config, E>`                     | Lightweight stable reference to a record                                      |
| `Scl.TrackedRecord<E>`           | `Core.TrackedRecord<Config, E>`           | Record as returned by queries (has `id`, `tagName`, `attributes`, `children`) |
| `Scl.RawRecord<E>`               | `Core.RawRecord<Config, E>`               | Record without DB-tracking metadata                                           |
| `Scl.TreeRecord<E>`              | `Core.TreeRecord<Config, E>`              | Record with its full subtree (used in clone operations)                       |
| `Scl.AttributesValueObjectOf<E>` | `Core.AttributesValueObjectOf<Config, E>` | `{ name: string, voltage?: string, ... }` for element `E`                     |
| `Scl.AttributesOf<E>`            | `Core.AttributesOf<Config, E>`            | Union of valid attribute names for `E`                                        |
| `Scl.ChildrenOf<E>`              | `Core.ChildrenOf<Config, E>`              | Union of valid child tag names for `E`                                        |
| `Scl.ParentsOf<E>`               | `Core.ParentsOf<Config, E>`               | Union of valid parent tag names for `E`                                       |
| `Scl.DescendantsOf<E>`           | `Core.DescendantsOf<Config, E>`           | All transitive child tag names reachable from `E`                             |
| `Scl.AncestorsOf<E>`             | `Core.AncestorsOf<Config, E>`             | All elements that can be ancestors of `E`                                     |
| `Scl.RootElementOf`              | `Core.RootElementOf<Config>`              | The root element tag name (`'SCL'`)                                           |
| `Scl.Operation`                  | `Core.Operation<Config>`                  | A single staged DB operation                                                  |
| `Scl.ParentRelationship<E>`      | `Core.ParentRelationship<Config, E>`      | `{ parent: Ref, child: Ref<E> }`                                              |
| `Scl.ChildRelationship<E>`       | `Core.ChildRelationship<Config, E>`       | `{ parent: Ref, child: Ref<E> }`                                              |
| `Scl.Attribute<E>`               | `Core.Attribute<Config, E>`               | `{ name, value, namespace? }` for an attribute of `E`                         |
| `Scl.QualifiedAttribute<E>`      | `Core.QualifiedAttribute<Config, E>`      | Attribute with namespace info                                                 |

See [Types](/v2019C1/api/types) for full reference and sync mechanism.
