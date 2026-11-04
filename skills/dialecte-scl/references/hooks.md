# scl hooks, per concern

Paths are relative to `src/v2019C1/hooks/`. Each hook folder holds one file per concern; their
results are merged into the hook's returned operations. Shared logic lives in `shared/` (barrel
`shared/index.ts`) - look there before writing a new reconcile helper.

Verify against the repo or installed version: hooks evolve with each release.

## Hook files (generated from the source)

<!-- dialecte-skills:generated hooks -->

| Folder                       | Concern files                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `after-created/`             | `after-created.ts`, `min-requested-scd-file.ts`, `private-wrapper.ts`, `ref-paths.ts`, `tuple-references.ts`                                                                                                                                                                                                                                            |
| `after-delete/`              | `after-delete.ts`                                                                                                                                                                                                                                                                                                                                       |
| `after-standardized-record/` | `after-standardized-record.ts`, `uuid-attribute.ts`                                                                                                                                                                                                                                                                                                     |
| `after-updated/`             | `after-updated.ts`, `min-requested-scd-file.ts`, `ref-paths.ts`                                                                                                                                                                                                                                                                                         |
| `before-clone/`              | `before-clone.ts`                                                                                                                                                                                                                                                                                                                                       |
| `before-commit/`             | `before-commit.ts`, `left-children.ts`, `prune-emptied-containers.ts`                                                                                                                                                                                                                                                                                   |
| `before-delete/`             | `before-delete.ts`, `min-requested-scd-file.ts`, `orphaned-refs.ts`                                                                                                                                                                                                                                                                                     |
| `io/`                        | `import-diagnostic-builders.ts`, `import-path-index.ts`, `io-hooks.ts`, `lnode-spec-naming-import.ts`, `mapped-data-import.ts`, `tuple-reference-import.ts`                                                                                                                                                                                             |
| `shared/`                    | `data-set-rename.ts`, `lnode-binding.ts`, `lnode-spec-naming.ts`, `reconcile-mapped-data-below.ts`, `reconcile-mapped-data.ts`, `record-ops.ts`, `ref-entry-ops.ts`, `ref-path-rebuild.ts`, `references-through.ts`, `signal-addresses.ts`, `signal-sibling-paths.ts`, `tuple-names-operation.ts`, `tuple-reference-rename.ts`, `tuple-target-parts.ts` |

<!-- /dialecte-skills:generated -->

## Record hooks (`index.ts` exports them for the project)

| Hook                    | Concern files                                 | What it guarantees                                                                                                                                                                                              |
| ----------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| afterStandardizedRecord | `after-standardized-record/uuid-attribute.ts` | a `uuid` on every element whose definition has one, when missing                                                                                                                                                |
| afterCreated            | `after-created/private-wrapper.ts`            | an element in an extension namespace sits inside the matching `<Private type=prefix>` (reused when one exists)                                                                                                  |
|                         | `after-created/ref-paths.ts`                  | a new reference gets its path attributes from the target uuid; a new target fills paths of references waiting for it; own-path attributes (e.g. ConnectivityNode `pathName`)                                    |
|                         | `after-created/tuple-references.ts`           | tuple names (ExtRef source fields, IEDName ...) written from uuids, both directions                                                                                                                             |
|                         | `after-created/min-requested-scd-file.ts`     | minimum-requested-file entries kept in sync                                                                                                                                                                     |
|                         | (signal / LNodeSpecNaming helpers)            | signal sibling paths, paths through a named LNode                                                                                                                                                               |
| afterUpdated            | `after-updated/ref-paths.ts`                  | a rename of a target or of any of its ancestors rewrites every referencing path; DataSet and tuple-target renames followed; mapped data stored in canonical form; LNode binding and signal addresses reconciled |
|                         | `after-updated/min-requested-scd-file.ts`     | entries follow edits                                                                                                                                                                                            |
| beforeDelete            | `before-delete/orphaned-refs.ts`              | references from outside into the deleted subtree are cleared (kept-on-orphan kinds) or deleted with everything they hold; parent children lists updated                                                         |
|                         | `before-delete/min-requested-scd-file.ts`     | entries follow deletions                                                                                                                                                                                        |
| afterDelete             | `after-delete/after-delete.ts`                | removed SourceRef/ControlRef rebuild their siblings' paths; removed LNodeSpecNaming rebuilds paths through its LNode                                                                                            |
| beforeClone             | `before-clone/before-clone.ts`                | clones lose `uuid`; empty Private noise dropped; elements of a supported namespace that the definition no longer has are dropped                                                                                |
| beforeCommit            | `before-commit/before-commit.ts`              | an `LNodeSpecNaming` on every LNode the transaction created (children exist only then); emptied containers pruned; last, deleting a record but leaving a child in the store throws `CHILD_LEFT_BEHIND`          |

## Import hooks (`io/io-hooks.ts`; one import session per file)

Two passes, no store access:

1. `beforeImportRecord`, per record at its closing tag (children before their parent): collects uuid targets, pending path → uuid
   resolutions, references with a uuid but no path, own-path elements, unsupported XPath references,
   mapped-data / LNodeSpecNaming / tuple-reference facts, a data-type index. Paths are not parsed
   here (what they depend on can come later in the file).
2. `afterImport`: builds the path index (legacy forms included), resolves everything, returns the
   creates/updates and the import diagnostics, returned with the imported file. Kinds: unresolved reference, unsupported XPath reference,
   incoherent reference, incoherent path names, data path not split, derived specification naming).

Rules when changing import: keep it in memory; if logic exists as a query-based function, split it
into a gatherer (query) and a pure composer, and feed the composer from pass-1 data.

## Rules when changing a hook

- Hooks return operations; returned operations are not standardised and fire no hooks. A delete
  needs the parent's updated children list and a delete for every record of the deleted record's
  subtree (read with `readSubtreeRecords`): a child left in the store makes the commit refuse it
  (`CHILD_LEFT_BEHIND`). `buildCascadeOperations` deletes the roots it is given and what refers
  into them, not what the roots hold.
- `afterStandardizedRecord` must be idempotent.
- Generic parent types in hook HELPERS (e.g. `private-wrapper.ts`) stay bound to `ElementsOf`, not
  `ParentsOf<...>`: there the latter explodes into a huge union and doubles type-check time.
- A hook concern used by import and by edits goes to `shared/`.
