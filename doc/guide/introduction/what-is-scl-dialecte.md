# What is SCL Dialecte?

`@dialecte/scl` is the **reference Dialecte implementation** for [IEC 61850](https://en.wikipedia.org/wiki/IEC_61850) — the international standard for substation automation and communication. It turns the IEC 61850-6 `SCL` (Substation Configuration Language) specification into a fully-typed DSL backed by IndexedDB, with a Document/Query/Transaction API.

If you haven't read it yet, [What is Dialecte?](https://dialecte.github.io/core/guide/introduction/what-is-dialecte) explains the general model. This page focuses on what `@dialecte/scl` adds on top.

## What SCL is

SCL is the XML format defined by IEC 61850-6 for describing the configuration of electrical substations: their topology (Substation → VoltageLevel → Bay), the IEDs (Intelligent Electronic Devices) installed in them, how those IEDs are wired together logically, and the data models each one exposes.

SCL files are the exchange format between engineering tools in the substation automation workflow — they can be large, highly structured, and strictly governed by the IEC 61850-6 XSD schema.

## What the dialecte provides

`@dialecte/scl` packages three SCL-specific layers on top of `@dialecte/core`:

### 1. Generated definition

The SCL definition is produced from the **IEC 61850-6 v2019C1 XSD**. Every element, attribute, parent–child constraint, and namespace declared in the standard is captured in a typed config object. The version is reflected in the import path:

```ts
import { openSclDocument } from '@dialecte/scl/v2019C1'
```

### 2. Domain extensions

Domain-specific query and transaction methods are plain functions registered on the document under named groups. They are available directly on `doc.query` and `tx`:

```ts
// Query extension
const latest = await doc.query.history.getLatestHitem()

// Transaction extension
await doc.transaction(async (tx) => {
	await tx.history.addHistoryEntry({ filename, header, item })
})
```

| Module      | Kind        | Method                                | What it does                                                      |
| ----------- | ----------- | ------------------------------------- | ----------------------------------------------------------------- |
| `history`   | query       | `getSortedHitems()`                   | All `Hitem` records sorted by version/revision ascending          |
| `history`   | query       | `getLatestHitem()`                    | Most recent `Hitem` by version/revision                           |
| `history`   | transaction | `addHistoryEntry(params)`             | Ensures `Header` + `History`, increments version, appends Hitem   |
| `dataModel` | query       | `resolve(params)`                     | Walks `lnType` → `LNodeType` → `DOType` → `DAType`/`EnumType`     |
| `dataModel` | transaction | `extract(params)`                     | Deep-clones missing data-model types into `DataTypeTemplates`     |
| `template`  | transaction | `ensureSubstationTemplateStructure()` | Ensures `Substation/VoltageLevel/Bay` named `TEMPLATE` under root |

See the [Extensions API](/api/v2019C1/extensions/) for full signatures.

### 3. Hooks

Hooks enforce SCL-specific invariants automatically — no application code needed.

**Transaction hooks:**

| Hook                      | Trigger                        | What it does                                                                                   |
| ------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `afterStandardizedRecord` | Before a record is persisted   | Generates a fresh `uuid` on any element that supports it but lacks one                         |
| `beforeClone`             | Before cloning a subtree       | Strips `uuid` attributes (clones get fresh identifiers); skips empty `<Private>` wrappers      |
| `afterCreated`            | After a child element is added | Wraps elements from a non-default namespace inside a `<Private>` container, as required by SCL |

**IO hooks (import pipeline):**

| Hook                 | Trigger              | What it does                                                                                         |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `beforeImportRecord` | For each XML element | Ensures `uuid` present; indexes path → uuid for targets; queues pending UUID resolutions for refs    |
| `afterImport`        | After all elements   | Resolves queued path references to UUID values; emits `UnresolvedReferenceWarning` when unresolvable |
