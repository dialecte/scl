# What is SCL Dialecte?

`@dialecte/scl` is the **reference Dialecte implementation** for [IEC 61850](https://en.wikipedia.org/wiki/IEC_61850) — the international standard for substation automation and communication. It turns the IEC 61850-6 `SCL` (Substation Configuration Language) specification into a fully-typed, chainable DSL backed by IndexedDB.

If you haven't read it yet, [What is Dialecte?](https://dialecte.github.io/core/guide/introduction/what-is-dialecte) explains the general model. This page focuses on what `@dialecte/scl` adds on top.

## What SCL is

SCL is the XML format defined by IEC 61850-6 for describing the configuration of electrical substations: their topology (Substation → VoltageLevel → Bay), the IEDs (Intelligent Electronic Devices) installed in them, how those IEDs are wired together logically, and the data models each one exposes.

SCL files are the exchange format between engineering tools in the substation automation workflow — they can be large, highly structured, and strictly governed by the IEC 61850-6 XSD schema.

## What the dialecte provides

`@dialecte/scl` packages three SCL-specific layers on top of `@dialecte/core`:

### 1. Generated definition

The SCL definition is produced from the **IEC 61850-6 v2019C1 XSD**. Every element, attribute, parent–child constraint, and namespace declared in the standard is captured in a typed config object. The version is reflected in the import path:

```ts
import { createSclDialecte } from '@dialecte/scl/v2019C1'
```

### 2. Chain extensions

Extensions inject domain operations directly into the chain as typed methods. Current extensions:

| Extension   | Element       | What it does                                                    |
| ----------- | ------------- | --------------------------------------------------------------- |
| `extractTo` | `Function`    | Extracts a Function and its subtree into a separate `.fsd` file |
| `extractTo` | `SubFunction` | Same operation scoped to a SubFunction                          |

```ts
// Only available when the chain focus is a Function element
await dialecte.fromElement({ tagName: 'Function', id }).extractTo({ fileName: 'protection.fsd' })
```

### 3. Hooks

Hooks enforce SCL-specific invariants automatically — no application code needed.

| Hook                      | Trigger                        | What it does                                                                                                       |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `afterCreated`            | After a child element is added | Wraps elements from a non-default namespace inside a `<Private>` container, as required by SCL                     |
| `beforeClone`             | Before cloning a subtree       | Strips `uuid` attributes (clones must get fresh identifiers) and skips empty `<Private>` wrappers                  |
| `afterStandardizedRecord` | After record normalisation     | Post-processes standardised records before persistence                                                             |
| `beforeImportRecord` (IO) | During XML import              | Calls `ensureUuid` — every element that supports `uuid` is guaranteed to have one by the time it hits the database |
