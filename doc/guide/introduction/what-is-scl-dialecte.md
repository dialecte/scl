# What is SCL Dialecte?

`@dialecte/scl` is the **reference Dialecte implementation** for [IEC 61850](https://en.wikipedia.org/wiki/IEC_61850) — the international standard for substation automation and communication. It turns the IEC 61850-6 `SCL` (Substation Configuration Language) specification into a fully-typed DSL backed by IndexedDB, with a Document/Query/Transaction API.

If you haven't read it yet, [What is Dialecte?](https://dialecte.github.io/core/guide/introduction/what-is-dialecte) explains the general model. This page focuses on what `@dialecte/scl` adds on top.

## What SCL is

SCL is the XML format defined by IEC 61850-6 for describing the configuration of electrical substations: their topology (Substation → VoltageLevel → Bay), the IEDs (Intelligent Electronic Devices) installed in them, how those IEDs are wired together logically, and the data models each one exposes.

SCL files are the exchange format between engineering tools in the substation automation workflow — they can be large, highly structured, and strictly governed by the IEC 61850-6 XSD schema.

## What the dialecte provides

`@dialecte/scl` packages three SCL-specific layers on top of `@dialecte/core`:

### 1. Generated definition

The SCL definition is produced from the **IEC 61850-6 v2019C1 XSD** by `@dialecte/create` (0.1 and later) and read through `@dialecte/core` 0.6. Every element, attribute, parent–child constraint, and namespace declared in the standard is captured in a typed config object. The version is reflected in the import path:

```ts
import { createSclProject } from '@dialecte/scl/v2019C1'
```

**Shape of the definition.** `DEFINITION` maps each tag to its definition: a tag the schema declares one way carries its declaration at the tag level; a tag declared several ways (`ConductingEquipment`, `Labels`) also lists its `declarations`, each under its number, the tag level being their union (required, default, fixed values, constraints and variants only where they all agree). A value's facets sit in its datatype (`type: { builtin, facets }`), identity constraints sit on the declaration that declares them (`constraints`), and `TYPES` holds the types an element may take with `xsi:type`, by Clark name. `SCL_DIALECTE_CONFIG` carries both as `definition` and `types`. Code that reads `DEFINITION` directly must follow that shape; code that goes through `query.getDefinition(ref)` gets the declaration that applies to the record, its `xsi:type` included.

**Namespaces.** SCL spans the default SCL namespace, the 6-100 extension namespace (`eIEC61850-6-100`), and `xsi`. Names follow the [core namespace rules](https://dialecte.github.io/core/guide/development/helpers#attribute-namespaces):

- Default-namespace attributes and elements use **bare** local names (`version`, `name`, `Substation`).
- 6-100 and `xsi` names are **prefixed**: attributes such as `eIEC61850-6-100:version` and `xsi:type` (on polymorphic slots like `BodyContent`). This holds whether the record was imported or created, so you read and write them by the same name.
- An element's namespace can depend on its **parent**: `Labels` is bare under `Substation`/`VoltageLevel`/`Bay` but `eIEC61850-6-100:Labels` under `DAS`/`DOS`/`SDS`. You always refer to it by the bare tag `Labels`; the correct namespace is applied automatically on serialization.

### 2. Domain extensions

Domain-specific query and transaction methods are plain functions registered on the document under named groups. They are available directly on `doc.query` and `tx`:

```ts
// Query extension
const latest = await doc.query.history.getLatestHitem()

// Transaction extension
await doc.transaction(async (tx) => {
	await tx.history.addEntry({ filename, header, item })
})
```

| Module      | Kind        | Methods                                                        | What it does                                                                    |
| ----------- | ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `history`   | query       | `getSortedHitems()`, `getLatestHitem()`                        | `Hitem` records sorted by version/revision                                      |
| `history`   | transaction | `addEntry(params)`                                             | Ensures `Header` + `History`, increments version, appends Hitem                 |
| `dataModel` | query       | `resolve(params)`, `isLNodeLocked(...)`                        | Walks `lnType` → `LNodeType` → `DOType` → `DAType`/`EnumType`; LNode lock state |
| `dataModel` | transaction | `importTypes(params)`, `unlockLNode(params)`                   | Content-addressed import of data-model types; unbinding an LNode from its IED   |
| `info`      | query       | `of(ref, options?)`, `ofEach(refs, options?)`                  | What a UI shows about an element: title, state, labels                          |
| `reference` | query / tx  | `buildElementPath`, `resolveReferencePath`, `setMappedData`, … | Reference paths: building, resolving, reverse lookup, remapping                 |
| `identity`  | query / tx  | `resolveIdentity`, `writeIdentity`, …                          | Instance lineage (`uuid` / `templateUuid` / `originUuid`)                       |
| `signature` | query       | `elementSignature(params)`                                     | Structural, id-independent signature of a subtree                               |
| `lifecycle` | query / tx  | `report`, `apply`, `extract.*`, `instantiate.*`, `update.*`, … | FSD / ASD / SSD templates: extract, instantiate, update                         |
| `cleanUp`   | transaction | `orphanUuidRefs()`, `resetLNode()`, `pruneEmptyContainers()`   | Post-mutation integrity helpers                                                 |

See the [Extensions API](/v2019C1/extensions/) for full signatures.

### 3. Hooks

Hooks enforce SCL-specific invariants automatically — no application code needed.

**Transaction hooks:**

| Hook                      | Trigger                                               | What it does                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `afterStandardizedRecord` | Every record entry point (create/clone/update/import) | Generates a fresh `uuid` on any element that supports it but lacks one (fill-only)                                                                             |
| `beforeClone`             | Before cloning a subtree                              | Strips `uuid` attributes (clones get fresh identifiers); skips only truly-empty `<Private>` wrappers (no children, value, or `type`)                           |
| `afterCreated`            | After a child element is added                        | Wraps elements from a non-default namespace inside a `<Private>` container, as required by SCL; keeps the IED's minimum requested SCD file current (see below) |
| `afterUpdated`            | After an element is updated                           | Keeps references in agreement with their target; keeps the IED's minimum requested SCD file current (see below)                                                |
| `beforeDelete`            | Before an element and its subtree are deleted         | Cleans references to the deleted subtree; keeps the IED's minimum requested SCD file current (see below)                                                       |
| `afterDelete`             | Once a record is staged for deletion                  | Rebuilds the references to the signals that shared the removed signal's name; rebuilds the paths through an LNode whose `LNodeSpecNaming` was removed          |
| `beforeCommit`            | Once the transaction's work is done                   | Gives every `LNode` the transaction created an `LNodeSpecNaming` when it has none (one brought by a copy or added by the caller is kept)                       |

**Minimum requested SCD file.** When a change affects an IED's configuration (control blocks and their settings, data sets, `ExtRef`, `DAI` values, relevant IED attributes, or its communication: `ConnectedAP`, addresses, `GSE`/`SMV`, `SubNetwork` settings and communication service specifications), the IED's `MinRequestedSCDFiles` gets an entry for the current SCD in the same transaction: `fileUuid` from the `Header` uuid, with its `version` and `revision` at edit time. `PhysConn` and its children, descriptive content, and changes only to IED `engRight` or `owner` do not trigger sync. Other IED attributes, including ICD-sourced ones, still count if changed through this SDK. Entries of other projects are kept, and a project is listed once: when an IED is cloned or an entry added for a project already listed, the entries are merged and hand-set `fileName`, `when` and `desc` are kept. An update counts when it changes an element's text or any attribute other than `desc` and the lineage uuids, subject to the IED exceptions above. A missing `Header` version or revision is written as an empty value; nothing is written when the `Header` has no uuid.

**IO hooks (import pipeline):**

| Hook                 | Trigger              | What it does                                                                                                                                               |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beforeImportRecord` | For each XML element | On the already-standardized record (uuid enforced by `afterStandardizedRecord`): indexes path → uuid for targets; queues pending UUID resolutions for refs |
| `afterImport`        | After all elements   | Resolves queued path references to UUID values; emits `UnresolvedReferenceWarning` when unresolvable                                                       |
