# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.5] - 2026-07-22

- Bump `@dialecte/core` to `0.4.6` - ExtendedDocument

## [0.3.4] - 2026-07-22

### Changed

- Include `LN0` records in data-model resolve/import-types flows: `dataModel.resolve` and `dataModel.importTypes` now accept `LN0` alongside `LNode`/`LN`, and lifecycle transplant deep-collection now includes `LN0` so related type import/remap covers root logical nodes too.

## [0.3.3] - 2026-07-21

### Changed

- **Faithful store (`@dialecte/core` 0.4.5)** — supersedes the "fill required/default attributes on import" behavior from 0.3.0. SCL import/export no longer materializes optional schema-default values (e.g. `desc=""`, `cardinality="1..1"`, `roleInst="1"`, empty LNode `ldInst`/`lnInst`/`prefix`); `fixed`/`required` markers (the `SCL` edition `release`/`revision`/`version` and their `eIEC61850-6-100:*` counterparts) are still emitted on export. Diff/reconcile needed no change — both sides read the same effective view. Golden snapshots and orphan-LNode assertions were updated to the faithful output.
- **Explicit `iedName="None"` on unbound LNodes.** `resetLNodes` (orphan-LNode cleanup) now stamps the marker itself, since the faithful store no longer auto-fills it on import.

## [0.3.2] - 2026-07-09

### Changed

- Bump `@dialecte/core` to `0.4.2`
- Update to typescript 7

### Fixed

- `ApplicationSclRef` element title based on child attributes

## [0.3.1] - 2026-07-07

### Changed

- Bump `@dialecte/core` to `0.4.0`

## [0.3.0] - 2026-07-02

### Changed

- Bump `@dialecte/core` to `0.3.0`: hooks are now provided on the `Project` instance (io + record hooks as one `DialecteHooks` object) instead of the config. `createSclProject` wires them automatically, so consumer code is unchanged. Importing a file now standardizes each record via core — canonical attribute order, filled required attributes, enforced schema namespace.
- `uuid` enforcement moved from the `beforeImportRecord` io pass to the shared `afterStandardizedRecord` hook, which runs at every record entry point (create/clone/update/import) and is fill-only. `beforeImportRecord` now reads the already-enforced `uuid` and only indexes/queues references. IO hooks are now built fresh per `createSclProject` (no shared module singleton).
- Regenerated the v2019C1 definition for the core namespace rules: non-default-namespace attributes are keyed `prefix:local` (`eIEC61850-6-100:*`, `xsi:type`), and elements whose local name spans namespaces carry a per-parent namespace override — e.g. `Labels` serializes as `eIEC61850-6-100:Labels` under `DAS`/`DOS`/`SDS` and bare under SCL parents. Fixes `.asd`/`.ssd` XSD validation of 6-100 content.

- `ensureUuid` (io-hooks export): the `afterStandardizedRecord` hook is now the single UUID authority.

## [0.2.24] - 2026-07-01

### Fixed

- `signature.elementSignature`: two members referencing the same type now produce identical signatures regardless of child order. This removes a false `@cycle` that made `dataModel.importTypes` fork a duplicate instead of reusing an equal type.

### Changed

- `dataModel.importTypes` (and `extraction.deep`) now reclaim type ids on update: when a changed type replaces one that nothing else references, the old type is removed and the new one keeps the original id — no more orphaned `<id>_<hash>` duplicate. Types still used elsewhere are left untouched. `ImportTypesStats` gains a `reclaimed` count.

## [0.2.23] - 2026-06-30

### Fixed

- ASD extraction (`extraction.toAsd`) places each referenced satellite by **mirroring its source hierarchy** — a satellite owned by a `Function` is cloned back under that function rather than flattened to `Substation` — and clones each referenced target exactly once.

### Changed

- `extraction.deep` performs a faithful subtree clone plus the content-addressed **type closure**; callers own reference rewiring. Its result exposes `recordMappings` (source record → target record across the cloned subtree) and `typeIdRemap` (source type id → reconciled target type id).

## [0.2.22] - 2026-06-29

- Bump `@dialecte/core` to `0.2.22` - fix withAllExtensions

## [0.2.21] - 2026-06-29

### Added

- `extraction` extension: unifies the generic element import and the FSD/ASD template recipes. `extraction.deep(...)` imports an element subtree together with its content-addressed **type closure**; `extraction.toFsd`/`toAsd` are the named recipes built on top.
- `signature` query extension: `elementSignature(...)` computes a structural, id-independent signature of an element subtree; with `resolveReferences`, id- and uuid-based references are folded into the referenced element's signature.
- `reference` extension: first-class DataTypeTemplates type references. `findRefsPointingTo` now resolves referrers of `LNodeType`/`DOType`/`DAType`/`EnumType`, and the new `applyTypeIdRemap` transaction repoints `lnType`/`type` references.

### Changed

- `dataModel.extract` is renamed `dataModel.importTypes` and is now content-addressed: structurally-identical types are reused, divergent ones are forked under a deterministic content-hash id (optionally prefixed via `forkPrefix`), and references are repointed — instead of duplicating types by id.
- The `import` and `template` extensions are merged into `extraction` (`tx.template.*` / `tx.import.*` → `tx.extraction.*`). FSD/ASD extraction is now expressed on top of `extraction.deep`.

## [0.2.20] - 2026-06-29

- Bump `@dialecte/core` to `0.2.21` - add `snapshots`

## [0.2.19] - 2026-06-26

### Added

- Type-performance CI gates (`type-bench:check` + `type-narrowing`) via `@dialecte/cli`, with per-version benchmarks under `benchmarks/types/v2019C1/`.

## [0.2.18] - 2026-06-11

### Added

- `resolveMappedLNode` and `buildMappedLNodePath` on the `reference` query extension - resolve a mapped `LNode` to the IED `LN`/`LN0` that implements it, composing the IED-section path from `iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst`. Unmapped LNodes (`iedName="None"`) resolve to `undefined`.

## [0.2.16] - 2026-06-10

### Added

- Bump `@dialecte/core` to `0.2.19` - add `xmlns` key name

## [0.2.15] - 2026-06-10

### Added

- missing `xsi` namespace to config and test utils

## [0.2.14] - 2026-06-09

### Fixed

- `resolveElementPath` now backtracks correctly when a matching segment leads to a dead-end subtree, fixing resolution of IED paths when a Substation shares the same name.

## [0.2.13] - 2026-06-09

### Fixed

- Added missing elements to the definition, after updating the generation script

## [0.2.12] - 2026-06-05

### Added

- `.icd` (IED Capability Description) added to supported file extensions for `project.import`.

## [0.2.11] - 2026-06-03

### Added

- `presentation.extractElementTitle` accepts `{ mode?: 'compact' | 'full' }` (defaults to compact).
- `presentation.extractElementTitle` overloaded: pass `{ withLabels: true }` to receive `{ title: string; labels: Record<string, string> }` with `<Labels>` collected; default call still returns `string` - no breaking change.
- Title overrides for IEC 90-30 and core SCL elements: `ExtRef`, `FCDA`, `ConnectedAP`, `ControlRef`, `SourceRef`, `FunctionRef`, `ApplicationSclRef`, `LNodeSpecNaming`, `SubscriberLNode`, `ControllingLNode`, `InputVar`, `OutputVar`, and more.

## [0.2.10] - 2026-06-03

### Changed

- Bump `@dialecte/core` to `0.2.16` - fix missing extension types to test utilities

## [0.2.9] - 2026-06-02

### Changed

- packages major version update
- Bump `@dialecte/core` to `0.2.15` - getTree handles transparent elements + blob storage + `Project.exportBlob`

## [0.2.8] - 2026-05-22

### Changed

- Bump `@dialecte/core` to `0.2.12` - InMemoryStore with writable/read-only mode

## [0.2.7] - 2026-05-21

### Changed

- Bump `@dialecte/core` to `0.2.11` - `export` fix

## [0.2.6] - 2026-05-19

### Changed

- added Modules types to hydrated test types

## [0.2.5] - 2026-05-19

### Changed

- Bump `@dialecte/core` to `0.2.10`

## [0.2.4] - 2026-05-19

### Changed

- Bump `@dialecte/core` to `0.2.9` - `SclTest.ActParams` now includes `project`

## [0.2.3] - 2026-05-18

### Changed

- Bump `@dialecte/core` to `0.2.8`

## [0.2.2] - 2026-05-12

### Changed

- Bump `@dialecte/core` to `0.2.6`

## [0.2.1] - 2026-05-11

### Changed

- Bump `@dialecte/core` to `0.2.4` - adds `ExportDocumentOptions.withDownload`

## [0.2.0] - 2026-05-11

### Added

- `createSclProject(params?)` factory: returns a pre-configured `Scl.Project` instance (config, extensions, hooks bundled); call `.open(name)` to connect the DB
- `Scl.Project` type exported from `hydrated.types`

### Changed

- Migrated to `@dialecte/core` v0.2.2 Project architecture
- `Scl.Project` is now `Project<Config, SclExtensions>` - full `import`, `export`, `openDocument`, `undo`, `redo` API available directly on the project instance
- IO hooks (`createSclIoHooks`) moved from `io/hooks/` to `hooks/io/` - bundled with transaction hooks under `hooks/`
- Test helpers: `createSclTestProject` replaces `createSclTestDialecte`; returns `{ project, source, target }` where `source`/`target` are `{ documentId, document }`
- `ActResult.assertOn` replaces `assertDatabaseName`; `ActParams.source`/`target` are `Document` instances directly
- All 25 test files updated to use new `ActParams` shape

### Removed

- `openSclProject` / `openSclDocument` / `createSclDocument` - replaced by `createSclProject().open(name)`
- `importSclFiles`, `exportSclFile` standalone functions - replaced by `project.import(file)` / `project.export(documentId)`
- `io/import.ts`, `io/export.ts` - IO is now handled by the Project instance

## [0.1.20] - 2026-05-07

### Added

- `transparentElements: ['Private']` in SCL dialecte config - `getChild`/`getChildren` now look through `Private` wrappers automatically when no direct match is found (e.g. `getChildren(lnode, 'DOS')` works without manual Private traversal)

### Changed

- `buildElementPath` SourceRef/ControlRef disambiguation: appends `(inputInst)` when != "1" and `.pDA` when non-empty; same for ControlRef with `(outputInst)`

## [0.1.19] - 2026-05-04

### Changed

- Update to `core` version v0.1.21

## [0.1.18] - 2026-05-04

### Added

- expose `presentation`

## [0.1.17] - 2026-04-30

### Added

- expose `presentation`

## [0.1.16] - 2026-04-30

### Added

- `presentation` extension: `extractElementTitle` query - returns a display-friendly title string for any SCL element based on `identityFields` with domain-specific overrides and separators

### Changed

- Upgrade to `@dialecte/core` v0.1.19 (key-based `OmitEntry` syntax)
- `omit-filters`: migrated from `{ tagName: 'X' }` to plain string entries (rename from `exclude-filters`)
- Template clone utilities: updated `getTree`/`findDescendants` calls to use new `omit`/`collect` API

## [0.1.15] - 2026-04-24

### Added

- Element catalog in the documentation

### Changed

- Update to `core` version v0.1.16 + new `definition` generation

## [0.1.14] - 2026-04-23

### Changed

- FSD extraction: strips `templateUuid` from root `Function` only - inner content keeps its `templateUuid`; promotes extracted `SubFunction` to `Function`
- ASD extraction: no attribute stripping on `Function` clone - all attributes preserved as-is
- `FunctionCategory`/`SubCategory` cloning: strips `templateUuid` and `originUuid` recursively in FSD; all attributes preserved in ASD

## [0.1.13] - 2026-04-23

### Changed

- `buildElementPath` returns `ElementPath` (`{ path, segments }`) instead of plain string - each segment carries its source `ref` (`{ tagName, id }`)
- `buildPathFromAncestry` returns `ElementPath | null` instead of `string | null`

### Added

- `ElementPath`, `PathSegmentWithRef` types exported from `reference` extension

## [0.1.12] - 2026-04-22

### Changed

- Switch to `Core.Query` and `Core.Transaction` types internally, to be able to expose `Scl.Query`, `Scl.Transaction` & `Scl.Document` that contains extensions

## [0.1.11] - 2026-04-22

### Added

- `PATH_EXTRACTION_CONFIG` extended with new elements
- `after-updated` ref-paths hook - reactively rebuilds ref path attributes when path-contributing ancestor attributes change

### Changed

- Reference constants reorganized into `extensions/reference/constants/`
- Clone remapping simplified using `cumulativeCloneMapping` from core

## [0.1.10] - 2026-04-21

### Changed

- `cloneFunctionWithCategories` split into `cloneFunction` + `cloneFunctionCategories` - decoupled tree cloning from category cloning for independent structural placement
- `cloneAllReferencedTargets` now skips `FunctionCategoryRef` - categories handled explicitly with `functionUuid` remap

### Fixed

- FunctionCategory cloned at wrong structural level (Bay instead of Substation) - categories now resolve source-side ancestry independently

## [0.1.9] - 2026-04-21

### Added

- `ALL_REF_UUID_ATTRIBUTES` constant - derived from `UUID_REFERENCE_PAIRS`, single source of truth for all uuid reference attribute names
- `clean-up` extension - extracted `orphanUuidRefs`, `orphanLnodeBindings`, `pruneEmptyContainers` from io-hooks into standalone transaction functions
- ASD extraction (`extractToAsd`) - clones Application + Functions + AllocationRoles + BehaviorDescriptions + DataTypeTemplates into target
- FSD extraction (`extractToFsd`) - clones Function + FunctionCategories + DataTypeTemplates into target
- Shared extraction bricks: `cloneFunctionWithCategories`, `cloneReferencedRecords`, `findMissingReferencedRecords`, `extractDataModel`, `cloneApplicationContent`

### Changed

- `UUID_REFERENCE_PAIRS` moved from `reference-mappings.ts` to `constants/reference.ts` with derived helpers
- `ensureSubstationTemplateStructure` moved to `template/transaction/` directory

### Fixed

- LNodeOutputRef/LNodeInputRef deleted during ASD extraction - `controlRefUuid`/`sourceRefUuid` were missing from remap attrs
- DataTypeTemplates empty in ASD extraction - scope was Application instead of Function (LNodes live under Function tree)

## [0.1.8] - 2026-04-14

### Changed

- `SclTest.TestCases` is now generic: `TestCases<T extends BaseTestCase = BaseXmlTestCase>` - accepts non-XML test cases
- `findAncestors` calls updated to use `{ order: 'top-down' }` option instead of manual `reverse()` (path/build, path/resolve)
- `assert` replaced with `invariant`
- Upgraded `@dialecte/core` to `0.1.11`

## [0.1.7] - 2026-04-14

### Added

- `SclTest.BaseTestCase` — non-XML base type (was previously missing; `BaseTestCase` was incorrectly aliased to `BaseXmlTestCase`)
- `SclTest.BaseXmlTestCase` — explicit XML variant alias
- `SclTest.TestContext` — `TestContext<Config>` bound to SCL config
- `SclTest.TestRunner` — `TestRunner<Config>` bound to SCL config

## [0.1.6] - 2026-04-14

### Fixed

- `@dialecte/scl/v2019C1/test` export now resolves correctly — vite config fix

### Changed

- Hook files reorganised into per-hook folders; each hook is now a thin controller delegating to a named collaborator file

## [0.1.5] - 2026-04-14

### Added

- Expose test helpers via `@dialecte/scl/v2019C1/test`

## [0.1.4] - 2026-04-13

### Added

- IO documentation: overview, reference, hooks

### Changed

- `runSclTestCases`: now a pre-bound `TestRunner<Config>` object via `createTestRunner` — flat API: `.withExport`, `.withoutExport`, `.generic`
- `@dialecte/core` updated to `0.1.9`
- docs: restructured nav from `/api/v2019C1/` to `/v2019C1/` — API, IO, Extensions in separate sidebar sections

## [0.1.3] - 2026-04-01

### Added

- Extensions (query & transaction): `history`, `dataModel`, `template`
- Test helpers and documentation

### Removed

- Old chain API methods

## [0.1.2] - 2026-03-13

### Added

- `createSclIoHooks`: resolves path/name references to UUIDs during import. Unresolved references are returned as `warnings` on `AfterImportResult`.

### Changed

- `createSclTestRecord`: now created via `createTestRecordFactory<Scl.Config>` — fully typed against SCL element and attribute definitions

## [0.1.1] - 2026-03-11

### Changed

- Refine dialecte config type thanks to an interface

## [0.1.0] - 2026-03-11

### Changed

- Reboot and migration to Dialecte 0.1.0

## [0.0.12] - 2026-02-24

### Changed

- `extractTo` completed on `Function` to include
  - `FunctionCategory` and children
  - full data model

### Added

- `resolveDataModel` on `DataTypeTemplates`
- `addHistoryEntry` on `SCL`
- `getLatestHitem` on `History`
- `getSortedHitems` on `History`

## [0.0.11] - 2026-01-29

### Fixed

- fix handling of `Private` elements in the `afterClone`hook

## [0.0.10] - 2026-01-29

### Changed

- update core to 0.0.9

## [0.0.9] - 2026-01-29

### Changed

- `afterClone` hook: exclude empty `Private` element from cloning process

## [0.0.7] - 2026-01-29

### Added

- `extractTo` extensions: extract any `SubFunction` to a new database at the right level (ie : `Substation`, `VoltageLevel` or `Bay`)

### Changed

- adjust the getTree filtering on `Function` method extractTo for `FSD`

## [0.0.6] - 2026-01-29

### Added

- `exportSclFile` updated: `withDownload` parameter that triggers the download of the file

## [0.0.5] - 2026-01-29

### Added

- `exportSclFile` updated: add custom extension based on configuration `supportedExtensions`

## [0.0.4] - 2026-01-29

### Added

- `extractTo` extensions: extract any `Function` to a new database at the right level (ie : `Substation`, `VoltageLevel` or `Bay`)

## [0.0.3] - 2026-01-29

### Added

- Add structure helper to create the required `Substation > VoltageLevel > Bay` section

## [0.0.2] - 2026-01-29

### Added

- add pipelines to lint, format, check, publish and tag

## [0.0.1] - 2026-01-28

### Added

- SCL config
- hooks
- test-fixtures wrapper (over core)
- io wrapper (over core)
