---
name: dialecte-scl
description: Domain map of @dialecte/scl, the IEC 61850-6 SCL dialecte (v2019C1) - which business verbs already exist (reference, dataflow, lifecycle extract/instantiate/update/transplant, identity, dataModel, info, signature, history, cleanUp), what its hooks keep coherent on every write and import (uuids, reference paths, tuple names, Private wrapping, orphan cleanup, LNodeSpecNaming), the uuid reference registry, and how to check a standard-named behaviour against the standard text. Use it for any task on SCL documents (SSD, SCD, ICD, IID, FSD, ASD, ISD files; Substation, VoltageLevel, Bay, IED, LNode, ExtRef, DataSet, ConnectivityNode, Function...) through dialecte, in an app or inside the scl repo, even when the user only names an SCL element. Load together with the dialecte skill (and dialecte-contributing when changing scl).
license: MIT
metadata:
  author: dialecte
  version: '0.1.0'
---

# Dialecte SCL

`@dialecte/scl/v2019C1` is the SCL dialecte: the generated SCL definition plus a large layer of
hooks and business extensions. SCL is reference-heavy (uuids, name paths, tuples across IEDs), and
most bugs come from code that writes a reference, a name or a path by hand that a hook or a verb
already maintains. Before writing anything that touches SCL records, find the verb in the map below
and check what the hooks do for you.

Exact signatures: in the scl repo, the extension's folder under `src/v2019C1/extensions/`
(kebab-case, e.g. `data-model/`; most have a `query/` and a `transaction/` index), the installed `node_modules/@dialecte/scl/dist/**/*.d.ts`, or `https://dialecte.github.io/scl/llms.txt`.

## Entry points

```ts
import { createSclProject, readAttribute, readAttributes } from '@dialecte/scl/v2019C1'
import { runSclTestCases, createSclTestProject } from '@dialecte/scl/v2019C1/test'

import type { Scl } from '@dialecte/scl/v2019C1'
```

`readAttribute(s)` from the scl entry needs no config (prefer it over core's). `SCL_DIALECTE_CONFIG`
(also exported) holds the definition tables: `children`, `parents`, `attributes`, `descendants`,
`ancestors`. `namespace Scl` gives the hydrated types: `Scl.Query`, `Scl.Transaction`, `Scl.Ref<'Bay'>`,
`Scl.AttributesValueObjectOf<'LNode'>`, `Scl.ChildrenOf<'Bay'>`, `Scl.ElementsOf`, ... Use them
directly; do not re-alias them.

## Business verbs: check here before writing

Ask the cli first, by what the verb is for: `npx @dialecte/cli api find "copy an IED with its types"`
(add `--package @dialecte/scl` to see only scl's verbs), then `npx @dialecte/cli api show <route>` for the
chosen verb's signature, summary and one call. For what an SCL element may hold or where it may sit,
`npx @dialecte/cli schema <Tag>` (`schema IED`, `schema Bay`) answers from the installed definition; never
read `definition.generated.ts` or the XSD for it. Without the cli, search
[references/api.md](references/api.md): every verb by what it is for ("label or title of an
element", "find who references an element"), with its JSDoc summary. The map below is the compact
list. Read a verb's JSDoc and tests before ruling it out; a short name hides a lot.

<!-- dialecte-skills:generated extensions -->

| Namespace   | On `doc.query.<ns>`                                                                                                                                                                                                                          | On `tx.<ns>` (writes)                                                                                                                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cleanUp`   | -                                                                                                                                                                                                                                            | `orphanUuidRefs`, `pruneEmptyContainers`, `pruneUnusedTypes`, `resetLNode`                                                                                                                                                                                                                 |
| `dataModel` | `isLNodeLocked`, `resolve`                                                                                                                                                                                                                   | `importTypes`, `unlockLNode`                                                                                                                                                                                                                                                               |
| `dataflow`  | `all`, `crossing`, `ofControlRef`, `ofIed`, `ofSourceRef`, `subscribersOf`                                                                                                                                                                   | `link`, `unlink`                                                                                                                                                                                                                                                                           |
| `history`   | `getLatestHitem`, `getSortedHitems`                                                                                                                                                                                                          | `addEntry`, `startFile`                                                                                                                                                                                                                                                                    |
| `identity`  | `identityEquals`, `resolveIdentity`                                                                                                                                                                                                          | `restoreClonedUuids`, `writeIdentity`                                                                                                                                                                                                                                                      |
| `info`      | `of`, `ofEach`                                                                                                                                                                                                                               | -                                                                                                                                                                                                                                                                                          |
| `lifecycle` | `checkTemplateUuids`, `classifyIeds`, `report`, `sourceRoot.asd`, `sourceRoot.fsd`, `sourceRoot.ssd`                                                                                                                                         | `apply`, `extract.asd`, `extract.ensureSubstationTemplateStructure`, `extract.fsd`, `extract.ied`, `extract.ssd`, `instantiate.asd`, `instantiate.fsd`, `instantiate.resolveTargetStructure`, `instantiate.ssd`, `makeUnique`, `transplant.deep`, `update.asd`, `update.fsd`, `update.ssd` |
| `reference` | `buildElementPath`, `buildMappedLNodePath`, `buildReferencePath`, `findOwnProvenance`, `findRefsPointingTo`, `getProvenance`, `resolveElementPath`, `resolveMappedData`, `resolveMappedLNode`, `resolveMappedLNodes`, `resolveReferencePath` | `applyTypeIdRemap`, `applyUuidRemap`, `removeOwnProvenance`, `setMappedData`, `writeProvenance`                                                                                                                                                                                            |
| `signature` | `elementSignature`                                                                                                                                                                                                                           | -                                                                                                                                                                                                                                                                                          |

<!-- /dialecte-skills:generated -->

Reach for a namespace when you need to...

- `reference`: build or resolve a name path, find who points at an element, follow mapped data, remap ids after a copy
- `dataflow`: list or create/remove signal flows between IEDs / LNodes
- `lifecycle`: copy specification content between documents, instantiate templates, update an instance from a newer template, copy a subtree faithfully across documents
- `identity`: decide whether two elements are "the same" across documents
- `dataModel`: resolve an LN's data types, import DataTypeTemplates content
- `info`: a display title and state labels for an element
- `signature`: structural equality / fingerprint of a subtree
- `history`: Header / History entries
- `cleanUp`: remove dangling references, empty containers, data types nothing names

Known primitives people re-implement by mistake:

- **Copy a subtree from another document**: `tx.lifecycle.transplant.deep`. On top of the clone it
  brings the data type closure along (`importTypes`, `lnType` repointed); when the copied root is
  itself a `Private` and the target parent already holds one of the same type, its children are
  added to that one instead of a second wrapper. It does not follow uuid references: call
  `tx.reference.applyUuidRemap` with its clone mappings. Plain `getTree` + `deepClone` gets none
  of this (and `getTree` unwraps Privates unless you pass `unwrap`).
- **Lookup by attribute values**: core `findByAttributes`.
- **Data path vs type**: the `dataModel` / `reference` readers, not string splitting.
- **Tuple names** (ExtRef, FCDA, IEDName, ClientLN...): create the element with the uuids; the
  `afterCreated` hook writes the names.
- **Lifecycle work** is two-track: `query.lifecycle.report(...)` returns a diff report, then
  `tx.lifecycle.apply(...)` applies it (headless fast track, or with the user's decisions).
- Public constants, guards and types for consumers come from `extensions/public.ts`, re-exported
  by the package entry. Lifecycle internals (`engine/`, `layers/`, `lifecycle/transplant/transaction/primitives`)
  are not public: import them only when composing a new verb inside scl.

## What the hooks already do - never do these by hand

Every write through a transaction and every import runs them (see
[references/hooks.md](references/hooks.md) for the per-file detail):

- **uuids**: every element whose definition has a `uuid` gets one when missing (afterStandardizedRecord);
  clones lose theirs and get new ones (beforeClone).
- **Reference paths from uuids**: creating a reference fills its path attributes from the target's
  uuid; creating a target fills the paths of references already pointing at it; renaming a target
  (or any ancestor of it) rewrites every referencing path (afterCreated / afterUpdated).
- **Tuple names**: names on ExtRef, IEDName, ... are written from the uuids, both directions.
- **Namespaced elements** from an extension namespace are wrapped in the right `<Private>`
  automatically (afterCreated).
- **Deleting** an element clears or deletes the references pointing into its subtree, per the
  orphan rules (beforeDelete); a deleted reference goes with everything it holds (a FunctionRef's
  SignalRole, a Terminal's Text and Private); signal sibling paths are rebuilt (afterDelete).
- **At commit** (beforeCommit): LNodes get their `LNodeSpecNaming`, once children exist; an
  `LNodeType` / `DOType` / `DAType` / `EnumType` the transaction left with no element naming it
  (it had one before) goes, with the types only it named and every record inside them; the
  containers the transaction left empty are pruned (an emptied `DataTypeTemplates` among them);
  last, a commit that deletes a record and leaves one of its children in the store is refused
  (`SCL_ERRORS.CHILD_LEFT_BEHIND`). So removing the last element naming a type and naming it
  again in a later transaction names a missing type: create the new one first, or in the same
  transaction. An import keeps a file's unused types; `tx.cleanUp.pruneUnusedTypes()` sweeps
  them on demand. In an app, `tx.delete` already takes the whole subtree. Inside scl, a hook (or
  any code staging operations by hand) that deletes a record stages a delete for every record of
  its subtree, read level by level with `readSubtreeRecords`, never `findDescendants`;
  `buildCascadeOperations` deletes only the roots it is given and what refers into them, not
  what the roots hold, so stage the rest yourself. Both are scl internals (`hooks/before-delete`,
  not exported by the package): use them only when changing scl itself.
- **Import** (two passes, no store reads): resolves path ↔ uuid both ways, fills missing paths,
  indexes legacy paths, and reports unresolved / incoherent / unsupported references instead of
  failing: they come back with each imported file as diagnostics (`SCL_IMPORT_DIAGNOSTICS`,
  narrowed with `isSclImportDiagnostic`).

So: create or update with the uuid (or the name, where that is the identity), commit, and read
back. If you find yourself computing a path string, setting a name on a tuple, or walking
references after a delete, stop - check the hook first.

## The reference registries - read them, never restate them

`constants/reference-pairs.ts` holds `UUID_REFERENCE_PAIRS` (which element references which target,
through which uuid and path attributes), `TUPLE_REFERENCE_PAIRS` (cross-IED tuples: ExtRef, FCDA,
IEDName, ClientLN, Association, ConnectedAP, GSE, ServerAt, ExtCtrl, ...), `REFERENCE_TAG_NAMES`,
`TARGET_ELEMENT_TYPES` and the orphan rule `KEEP_ON_ORPHAN_REFS`; derived views live in
`extensions/reference/constants/` (pairs by reference tag, resolution type, path extraction
config). Any table you are about to write that lists reference tags, attribute pairs or
targets is a copy of this registry: import the derived view instead.

## Tests in scl

`runSclTestCases` from `@dialecte/scl/v2019C1/test` (the shape is in the `dialecte` skill's testing
reference) plus two fixture validators that run before every case: XML validity against the SCL
definition, and reference coherence (empty, dangling, wrong-target, path mismatch).

- Inline fixtures start with `<SCL ${ALL_XMLNS_NAMESPACES} ${CUSTOM_RECORD_ID_ATTRIBUTE}="scl-1">`.
- An intentionally incoherent fixture opts out per case with `allowIncoherentReferences: '<reason>'`
  (also an option of `createSclTestProject`).
- XPath prefixes are the config keys: `default:`, `v2019C1:` (not `eIEC61850-6-100:`) and `xsi:`.
- `createSclTestRecord` builds a typed record for pure-function tests; `npm run format:xml`
  re-indents the inline XML.
- Read attributes of a held record with scl's `readAttribute(s)` (bound to the SCL config, no config
  to pass); inside a transaction use `tx.getAttribute(s)`.

## Working in the scl repository

- Sources live in `src/v2019C1/` (the SCL version folder); a new SCL version is a new folder.
- `Private` is a transparent element in the SCL config: `getTree` lifts its children into the parent
  unless you pass `unwrap: []` - always pass it when you copy or compare vendor content.
- `npm run doc:build` regenerates `.vitepress/data/elements-catalog.json` and can rewrite
  `doc/v2019C1/api/elements.md`; restore them right after the doc build if you did not mean to
  change them, before `check` and before any hand-over script exists.
- Large-document benches: `src/v2019C1/test/fixtures/` holds a stress-fixture generator and
  `run-scl-benchmarks.ts` (run with `TSX_TSCONFIG_PATH=./tsconfig.node.json npx tsx ...`).
- The standard behind this package is IEC 61850; the citation self-check before a hand-over adds its
  document names: `grep -nE '61850-[0-9]+ ?§|9[0]-30|7-[0-9] ?§'` over the changed files.

## Behaviour the standard names: check the text, not the code

When a decision touches something the standard defines (file content per file type, reference
forms, naming, uuid rules, service types, dataflow), the standard text is the source. Code, a
consumer's current behaviour or a sentence in a chat or issue are pointers, never the source.

1. If the IEC text is available locally, use it. Look for `$DIALECTE_STANDARD_DIR` (a folder of the
   IEC 61850 parts converted to markdown), or ask the user where it is. Grep first, read around the
   hit, anchor by content (line numbers drift between conversions).
2. Write down the rule with its location (part, clause, line) in your uncommitted working notes or
   plan, then decide. Committed files, commit messages, issues and PRs state the behaviour only:
   no standard citations there (see dialecte-contributing code rules).
3. If no text is available, say so and ask a maintainer; do not decide from code alone.

**Copyright.** The IEC standards are copyrighted and licensed per user. Never commit, publish or
paste their text: not in code, comments, docs, tests, commit messages, issues or PRs, and never
into this skill. Read it locally and state the behaviour in your own words. Sharing the converted
files is the licence holder's decision, not the agent's.

**Engine vs consumer rules**: scl implements the standard's behaviour as the default. An expert or
product rule the standard does not require becomes an option of the verb (default = the standard)
that the consumer sets. A rule that contradicts the standard is a consumer policy, outside scl.

## Retro gate - before you hand over

List in your hand-over every place where this skill was wrong, missing or misleading for the task,
and every correction the user made that a skill should have prevented. Then:

- **Inside a dialecte repository**: fix the skill page in the same change (skills ship with the
  package that owns the code) and run `npm run skills:generate`, then
  `npm run skills:check`.
- **In an app**: draft an issue for the package that ships the skill - the statement that was wrong
  or missing, the evidence (file, behaviour), the wording you propose - and show it to the user.
  Post it only with their approval.
- Nothing to report: write "skill retro: nothing".
