# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking: a role or a category is matched by name only where it lands.** A template's `AllocationRole` or `FunctionCategory` was mapped onto the one element of that name anywhere in the project: a role `PIU` of a bay placed in one substation could land on a `PIU` of another substation, and the placed functions were allocated through it. It is now found by name only in the element of the project its own level lands on (the bay, voltage level or substation whose `Private` holds it); a level the placement creates holds none, so the role or category is created there. The same holds for the one created from the same template element by an earlier placement (its `templateUuid`): a template element may be instantiated several times, so a bay typical placed twice gives each bay its own role instead of sharing the first bay's; a fork, keeping the file's own uuids, still finds it anywhere. One of that name elsewhere stays listed as a candidate the consumer may choose (`resolution.mappings`). A caller relying on the document-wide match chooses it. Breaking for `report`, `apply`, `instantiate.*` and `update.*`.

### Fixed

- **An SSD template holding two elements named `TEMPLATE` side by side is refused** (breaking for a caller relying on the first one being placed). A template level holding several elements named `TEMPLATE` (two `TEMPLATE` substations in the file, two `TEMPLATE` voltage levels in a substation, two `TEMPLATE` bays in a voltage level) is not a valid file: names are unique among siblings. `report`, `apply`, `instantiate.ssd` and `update.ssd` placed what the first of them held and silently dropped the others; they are now refused with the new `SSD_TEMPLATE_NOT_UNIQUE` (`SCL2009`) before anything is written, `meta: { parent, duplicates }` naming the element holding them and each of them. `query.lifecycle.sourceRoot.ssd()` reads such a file as holding nothing to instantiate (`none`).

- **Bays each holding a category of the same name keep one each.** Two bays of an SSD each classifying their function under a category `MEASUREMENT` were written with one category after `apply`, both functions classified under the one of the first bay, while the report listed two new ones. Categories are now resolved once before anything is written, as roles are, and a category several applications of one placement share is still placed once.

- **An SSD update giving several bays a new role of the same name keeps one each.** A newer SSD template adding a role `BAY_CTRL` to each of two placed bays was applied as one role, both applications referring to it, while the report listed two. Each is now resolved where its own bay lands.

- **A role or category an update adds is written in its instance's level.** A role a newer template adds to a placed bay was written in the `Private` of the level the update was started from (the substation, or the voltage level), not in the bay holding the instance; a category the same way. Each is now written where its instance sits, and the report lists it as created there.

- **A placed bay no longer carries a reference to what the template does not hold.** A template bay whose breaker terminal sits on a connectivity node of another bay, one the template does not hold, was placed with the terminal still naming that node by its template path (`TEMPLATE/TEMPLATE/Bay_HV/L2`), which names nothing in the project; an update of the placed bay added it again. A terminal or neutral point written by path only, with no uuid, now reads as naming a node the template does not hold (the predefined `grounded` node excepted): it is not written, on a first placement and on an update alike, whether it belongs to the bay's own equipment or to the equipment of a function placed with it (`report`, `apply`, `instantiate.*`, `update.*`). The report lists each one in `warnings`, with the new code `reference-not-placed`: the template's reference element, the attribute naming its target and the path it was written with.

- **A terminal on the predefined grounded node names the bay it was placed as.** An earthing switch's terminal on `TEMPLATE/TEMPLATE/Bay_MV/grounded` kept that template path, and the template's level names, once its bay was placed. No file declares the grounded node, so no uuid repointed it: it now names the grounded node of the bay as placed (`S1/15kV/Bay_MV/grounded`, or `S1/15kV/Bay_MV_1/grounded` when the bay was numbered), with that bay's `substationName`, `voltageLevelName` and `bayName` — on an SSD placement and an SSD update of a bay, and on an FSD or ASD placement of a function holding the earthing switch.

- **A reference a placement leaves out because it names what it does not place is told of.** A role allocating a function another application holds, a category classifying a function not placed, a variable applying to one: the reference by uuid was left out without a word. The report now lists each in `warnings` as `reference-not-placed`, with the reference element, the attribute naming its target and the path written, wherever it is met: in a role, a category, a variable or a behaviour description, whether it is held by a level, by a placed function or referred to by a role, on a first placement or an update, alongside the references to nodes the template does not hold. A variable a placed function holds that is left applying to nothing is not written, and each of its applications is warned.

- **A function placed on its own no longer names a function it does not place.** An FSD placement of one function holding a variable that applies to it and to another function of the template wrote both applications, the second naming that other function by its template path (`TEMPLATE/TEMPLATE/TEMPLATE/Ctrl`), which names nothing in the project. What the function holds is now scoped as an ASD or SSD placement scopes it: such a reference is not written, and warned `reference-not-placed`; a variable left applying to nothing the placement places is not written at all, each of its applications warned; one applying to the bay the function lands on names that bay as placed.

- **An update writes the earth terminal of a function's equipment on the grounded node of its level.** An FSD or ASD update adding an earthing switch to a placed function, and an SSD update adding one to a function of a placed bay, kept the template's path (`TEMPLATE/TEMPLATE/TEMPLATE/grounded`) on its terminal; it now names the grounded node of the bay the function sits in, with that bay's level names.

- **A variable or behaviour description an update adds is written in its instance's level.** An update started from a level above the instance (`update.asd` from a voltage level) wrote a variable the template gained in that level's `Private`, not in the bay holding the instance. It is now written where the instance sits, as a role is.

## [0.15.0] - 2026-11-11

### Added

- **`tx.lifecycle.extract.ied` exports a specification IED into an ISD**: with `fileType: 'ISD'`, `kind: 'instance'` and an input mode (`inputs: 'none'` or `'later-binding'`, both required), it writes into an empty target the selected IED under its name and uuids, with `issuer` as its manufacturer, the data types its logical nodes use, the `Communication` of its access points only, and the part of the specification it implements; the file holds no `MinRequestedSCDFiles`. Returns `{ warnings: ExtractWarning[] }`. The file:
  - starts with a fresh ISD `Header` (see the Header fix below) and records the source in the `Header` and the IED's source files, its type read from its registered extension: `.ssd` is an SSD; `.scd`, `.xml` or no extension an SCD, whatever its `Header` says. Another extension, an IED of a real device, a target already holding an IED, a substation, a line or a process, and `as: 'revision'` are refused before anything is written.
  - leaves out the supervision logical nodes (`LGOS`, `LSVS`) and a `SupSubscription` declaring a `maxGo` or `maxSv` above `0`, each listed (`supervision-left-out`, its source an `LN` or a `SupSubscription`). The data set members naming them go, and a data set left with none; a report, GOOSE or sampled-value control block whose data set changed gets `confRev` raised by `10000` once (a counter that is missing, invalid or would overflow refuses the export), a log control block is disabled.
  - leaves out a receiver, client, association or key distribution entry naming another IED, listed (`ied-reference-left-out`).
  - with `inputs: 'later-binding'`, writes every input of the IED, those fed by other IEDs included, in later-binding form: its description, internal address and expected data and service, its service type equal to its expected service, and nothing of the source it was bound to (IED, address, data, control block and their uuids); an expected value it lacks is taken from that source. An input still lacking its description, internal address, expected data object or a service (neither `pServT` nor `serviceType`) is written as it is and listed (`input-incomplete`, with what it lacks in `missing`). The IED is then no longer its own receiver or client; its control blocks and data sets stay.
  - writes the LNodes the IED implements in their substation, line or process frame, names and identifiers as in the source: a function or subfunction holding none of them is left out, an equipment written keeps its parts and the connectivity nodes it connects to, and an LNode implemented by a logical node the file leaves out is listed (`process-lnode-left-out`). A behaviour description travels only when all its LNodes do (otherwise left out and listed, `behavior-description-left-out`), variables with their applications to what the file holds, process resources when a written LNode's specification names them. An input or output specification naming what the file does not hold keeps its expected data without that link, and is listed (`process-reference-cut`). Each LNode gets its own naming as its specified naming; data specifications lose their mapping.
  - Options `labels`, `applications`, `allocationRoles` and `powerSystemRelations`, each `true` by default: `false` leaves every label, application, allocation role or power system relation out of the file. Option `internalService`, `false` by default: a specified flow between two LNodes of the IED is written with the service `Internal` and no link to its input, in the file only.
  - Content of another namespace, directly or inside a `Private`, is copied as it is and never counted as an SCL element: a vendor look-alike of an input, a supervision node, a receiver or a connection is neither left out nor listed, and does not bring a network into the file.

- **`tx.reference.writeProvenance` accepts an IED anchor**: records source-file history under the selected IED, appending each distinct file type, identity, version and revision while retaining earlier entries.

- **`query.reference.resolveMappedLNodes`**: answers which `LN` or `LN0` implements each of many LNodes, and in which IED, with one read of the document. A truthy `lnUuid` decides alone, even when it names nothing; otherwise the complete name path of the LNode. Logical nodes inside a `Private` are vendor payload and are never the answer.

### Changed

- Requires `@dialecte/core` 0.10.0 (pinned exactly, was 0.9.0). Nothing breaks: `getRecords` and `getChildren` read the records they ask by id in one store call, which `query.info.ofEach` relies on.

- `info.ofEach` reads its elements in one `getRecords` instead of one `getRecord` each, and reads the siblings of a signal (SourceRef, ControlRef) once per parent for the whole call instead of once per signal. Titles, states and labels are unchanged; an element handed over as a record is still described as stored, whatever `parent` or `children` it carries.

- **An ExtRef carrying its expected service as its service type reads as later-binding**: `query.info` and the dataflow extension give the state `later-binding` to an `ExtRef` with an internal address and an expected data object, nothing of a source, and a `serviceType` equal to its `pServT`: the form an ISD writes its inputs in. A `serviceType` other than `pServT`, or one without a `pServT`, still gives no state.

- **`SclFileReference@fileName` keeps the file's extension**: `tx.reference.writeProvenance`, and every extract or placement that records a source, now writes `P.ssd` for a source imported as `P.ssd`. A source with no uuid still matches a reference recorded earlier under the bare name `P`: a function or application reference at another version is rewritten in place with the new name and stays one reference, one at the same version keeps `P`, and the Header and IED lists keep `P` for the version they hold and append `P.ssd` for a new one.

- **`query.reference.resolveMappedLNode` reads the `lnUuid` first and counts the document's own logical nodes only**: an LNode with a truthy `lnUuid` resolves to the logical node of that uuid, or to nothing when it names none, whatever its names say or its `iedName`. Without one the complete names decide. A logical node inside a vendor `Private` is no longer an answer, whether found by uuid or by names; `query.reference.resolveMappedData` follows the same rule.

- **`tx.cleanUp.resetLNode` and `query.info` judge LNode bindings on native logical nodes**: an LNode naming only a logical node of a vendor payload, by uuid or by names, is released by the clean-up and reported `unmapped`. A data or signal reference whose target exists only in a vendor payload loses its names.

### Fixed

- **Dataflow no longer reads vendor look-alikes as native content**: an element of a vendor payload in a `Private` (an `LNode`, `LN`, `IED`, signal, `LNodeSpecNaming` or the target of a signal's further reference) no longer counts in allocations and listings, and can no longer take the place of or rename a native element. `query.dataflow.ofSourceRef` and `ofControlRef` now throw `ELEMENT_NOT_FOUND` for a signal held by a vendor LNode. The extension content a `Private` legitimately holds, such as a function template or the inputs of an LNode, is read as before.

- **New extractions replace the target Header**: FSD, ASD, SSD and ISD starts receive a fresh file identity and one initial `0`/`1` history item with current creation metadata. Earlier target history contributes only labelled inner text, not old version identities or Header attributes. Ordinary history appends are unchanged.

- **Applying an SSD whose bays each hold a role of the same name keeps one role per bay.** Two applications of a template, each referring to its own bay's role `PIU`, were written as one role by `instantiate.ssd` (and `apply` of an SSD report): both applications referred to the same bay's role, the other bay lost its own, and which bay kept it changed from run to run, while the report listed two new roles. Each role now lands where the report says, resolved once before anything is written.

## [0.14.0] - 2026-11-08

### Added

- **`SCL_DIALECTE`, the dialecte's declaration, exported from `@dialecte/scl/v2019C1`**: its id (`scl/v2019C1`), the package version, its config, its extensions and `createHooks()`. `createSclProject` and the test helpers are built from it; pass it to what core derives from a declaration, such as `createTestHelpers` or `serveSqliteEngine`. Its projects carry the dialecte's id and version (`project.dialecteId`), so a project's in-memory state is kept under the dialecte and the name: an in-memory project of another dialecte, or one made without a dialecte, no longer shares the state of an SCL project of the same name. A local project is unchanged.

- **`createSclProject` is core's project factory of the declaration** (`createProjectFactory({ dialecte: SCL_DIALECTE })`): its calls and the projects it makes are unchanged. It carries the declaration (`createSclProject.dialecte`) and deletes the SCL project of a name on a storage without opening it: `createSclProject.destroyProject({ name, storage })`.

### Changed

- **Breaking: requires `@dialecte/core` 0.9.0** (pinned exactly, was 0.8.1). An app that opens SCL projects on SQLite storage assembles the engine itself: its one engine worker file calls `serveSqliteEngine({ dialectes: [SCL_DIALECTE] })` (with its other dialectes) from `@dialecte/core/sqlite`, and its page calls `registerSqliteEngine({ url, dialectes })` once, before the first project opens; this package ships no worker. A project on local or in-memory storage changes nothing. Keep one `@dialecte/core` in the app's lockfile: a copy of another version finds neither the SQLite storage kind (`PROJECT_STORAGE_NOT_REGISTERED`) nor the engine (`PROJECT_SQLITE_ENGINE_NOT_REGISTERED`).

- **The test helpers of `@dialecte/scl/v2019C1/test` open their projects from the declaration**: a test project's config key is now `scl`, the dialecte's own, so a call passing `configKey: 'default'` is refused `UNKNOWN_CONFIG_KEY`: leave it out or pass `scl`.

## [0.13.2] - 2026-11-05

### Changed

- Requires `@dialecte/core` 0.8.1 (pinned exactly, was 0.8.0). Nothing changes in the engine; the core skills an agent syncs from this package's dependencies are 0.8.1's.

## [0.13.1] - 2026-11-04

### Changed

- The repository's tooling runs on `@dialecte/cli` 0.3.1 (nothing changes for a consumer).

## [0.13.0] - 2026-11-04

### Added

- **`query.lifecycle.sourceRoot.fsd()` / `.asd()` / `.ssd()` read the root of a template file** as data, without throwing on the shape of the file: `{ kind: 'found', ref }` (the ref the verb takes), `{ kind: 'several', candidates }` (in document order, each `{ ref, name, linked }`, `linked` listing the units placed together with it for an SSD), `{ kind: 'none' }`, and for an FSD `{ kind: 'unsupported', ref }` when the file holds an equipment function and no function. A file holding a function and an equipment function resolves to the function. An SSD answers as the verbs do: linked units are one candidate, and a scaffolding with nothing named below it is found at its deepest `TEMPLATE` level. The types (`SourceRoot`, `SourceRootCandidate`, `SourceRootRef`, `SourceRootUnsupported`, `SourceRootVerb`) are exported. The SSD verbs read the file the same way: the candidates their `SSD_SCOPE_AMBIGUOUS` error lists (`meta.candidates`) now follow the file's order too.

- **`tx.reference.writeProvenance` returns `{ changed }`** (`WriteProvenanceResult`): whether it changed what the element, or the `Header`, records — `false` when the element records that file version already, as its only reference to that file, or the `Header` lists it already.

### Changed

- **Breaking: an instance's `FunctionRole` / `FunctionRoleContent` without the template's lineage is listed as the project's own** (`target-only`, kept unless its removal is accepted), unless the consumer names its tags in `resolution.consumerManagedTags`: a consumer that writes such elements itself on the instances it places passes `consumerManagedTags: ['FunctionRole', 'FunctionRoleContent']` to `report` to get the previous behaviour (the report then lists nothing for them, and `apply` writes what the report lists). The option takes any tag of the schema and is read once for every diff of a report; a tag it names never hides an element the template holds or one that may be the template's own the newer revision dropped (it carries the template's lineage, or, in a fork given no previous revision, a uuid).

- **Breaking: each applied instance is `{ ref, placement }`**: every entry of `AppliedInstances` (the `instances` `tx.lifecycle.apply` returns, and what `resolution.afterApply` receives) and every root the direct verbs `tx.lifecycle.update.fsd`, `.asd` and `.ssd` return names its element in `ref` and says how the apply wrote it in `placement` — `'placed'` for a first placement (an instantiate, a first placement through an update, a function an application gains), `'reconciled'` for an instance the update matched and wrote to (an application, a function it composes or takes where it stands, a function a fork finds by its own uuid). Read `entry.ref` where the entry was the ref. The types `AppliedInstance` and `AppliedPlacement` are exported.

### Fixed

- **An update returns the instances it wrote to, and only those**: `tx.lifecycle.apply` with an FSD (and `tx.lifecycle.update.fsd` given decisions) listed every instance it matched. An instance is now returned when a change of it is accepted, or when the file reference it records (`FunctionSclRef` / `ApplicationSclRef`) is brought to the newer revision. It is left out when no change of it is written (every one declined, or none brought: an element the project added and kept is no change) and its reference already names that revision or the update writes none on it (a fork, an element updated as part of a larger template; see the update page's Apply result). So `resolution.afterApply` no longer runs on an instance the apply left as it is. An ASD update now also returns an application whose only write is its file reference (for instance the newer revision a function it stands on brought). A direct update verb called without decisions still writes everything the template brings and returns every instance it matched.

- **An application's provenance counts a function it stands on, and that function's accepted change is written**: when an application update finds a function of the gained lineage free where the instance lives and takes it, the change the report lists for that function is written when accepted even if the reference the application gains to it is declined and nothing of the application itself is written; the application's `ApplicationSclRef` then names the newer revision. With every change declined it keeps the revision it holds.

- **One function placed as a function and as a subfunction no longer warns** (`checkTemplateUuids`): a `Function`, `SubFunction`, `EqFunction`, `EqSubFunction`, `FunctionTemplate` and `SubFunctionTemplate` are read as one element type, so a `templateUuid` shared by several of these forms, or naming one form from another, is neither `cross-type-template-uuid` nor `template-uuid-type-mismatch`, and `referencesByName: 'placeholders'` no longer treats such a value as a placeholder. A value shared with an element outside that family (a `LNode`) is still reported, with the real tags in `tagNames`.

## [0.12.1] - 2026-11-04

### Changed

- **The repository's tooling runs on `@dialecte/cli` 0.3.0** (nothing changes for a consumer): the package declares the contributor profile, so the docs build and the type bench run in `dialecte contrib` instead of the gate; the browser tests run with the runner's defaults; the commit hook checks types, lint and format (`npm run check`, no longer `format:fix`), runs the tests through `dialecte gate --hook` (answered by a green `gate --full` of the committed tree), then builds.

## [0.12.0] - 2026-11-04

### Added

- **`tx.cleanUp.pruneUnusedTypes()` removes the data types nothing names**: every `LNodeType`, `DOType`, `DAType` and `EnumType` of the document that no `lnType` or `type` names goes, then the types it alone named, through the transaction (the delete hooks run), with every record inside them. A type is named by an `LN`, `LN0` or `LNode` (`lnType`), a `DO` or `SDO`, a `DA` or `BDA` (`type`, whatever its `bType`); a cycle of types naming each other stays. An import and an extract keep a file as written and do not call it: it is for a document that holds types nothing names (an imported file) when the caller wants them gone.

- **A commit that deletes a record and leaves one of its children behind is refused** (`CHILD_LEFT_BEHIND`, `SCL4001`, `meta: { record, child }`). The check runs on every commit, over the transaction's operations and the ones the commit hooks stage, and reads the store, in one batch, only for a child of a deleted record that no operation mentions; a hook that stages a delete without the subtree now fails at once instead of corrupting the store.

### Changed

- **A type a write leaves unused goes at the commit** (breaking for a caller that removes the last element naming a type and names it again in a later transaction: create the new element first, or in the same transaction). When a transaction leaves an `LNodeType`, `DOType`, `DAType` or `EnumType` that an element named before it and no element names now, the commit removes it, then the types it alone named, with every record inside them; a `DataTypeTemplates` left empty goes in the same commit. It applies to every write — a delete, a changed `lnType` / `type`, `tx.lifecycle.apply` (instantiate, update, fork), an extract, a plain edit — and a preview (`document.prepare`) shows it. Only a type that lost a referrer in the transaction is judged: a type nothing named before stays and keeps what it names, a type the transaction created stays, and a type named again in the same transaction stays. An import keeps the file as written.

- **`dataModel.importTypes` keeps a displaced type that a data attribute of any `bType` still names**: a superseded type was removed only when no data attribute naming it with a matching `bType` was left; it now stays while any `DA` / `BDA` `type` names it, as the schema's key reference reads it, and its fork keeps the hashed id. On a file where that happens, `reclaimed` of the returned stats is lower than before.

- **`DecisionGroup.sideEffects` lists the data types a removal leaves unused**, `deleted`, before the containers and references: the types the removed elements were the last to name, with the types only they name. A group is judged on its own, so for a report of several groups the list is not what `apply` removes for all of them; for one group it is.

- **A signal role path starts at the function its `FunctionRef` names and joins the signal to its LNode with `.`.** `LNodeInputRef@sourceRef` and `LNodeOutputRef@controlRef` are written from that function (a `Function`, `SubFunction`, `EqFunction` or `EqSubFunction`), the function left out, with `/` down to the LNode and `.` before the signal: `PTRC1.Trip`, `SF1/XCBR1.Oper` from a `Function`, `XCBR1.Oper` from the `SubFunction` `SF1`; `LNodeDataRef@data` takes the same base. The 0.11.0 form `SF1/PDIS1/AmpSv` is now written `SF1/PDIS1.AmpSv`. Values written before are still read, the path with `/` before the signal and the path from the nearest `Function` or `EqFunction` above the one the `FunctionRef` names, and written again in the new form on import, also next to a uuid. A signal outside the function the `FunctionRef` names keeps its absolute path. A query resolving such a path tries the keys in the same order, so `PTRC1.A/B` names the input `A/B` even when an input `A.B` comes first in the document.

- **The package declares its mutation scope for `dialecte mutants`** (`dialecte.mutation` in `package.json`); its equivalent-mutant records moved to `.dialecte/mutation-records.json`.
- **Mutation testing runs through `dialecte mutants` alone** (tooling of this repository; nothing changes for a consumer): the package's own runner and its `npm run mutants*` scripts are gone; `@dialecte/cli` 0.2.0 is the dev dependency that runs it.

### Fixed

- **Update and extract write only the types of the logical nodes they place**: a logical node left out of the clone — a functional variant the instance did not select on an update, a section an extract leaves out (equipment holding logical nodes) — no longer brings its types into the document, where nothing named them. `transplant.deep` imports the closure of the logical nodes it cloned, so what it leaves out (`leaveOut`, `omit`) brings none.

- **A reference a delete removes no longer leaves what it held in the store**: the `SignalRole` of a `FunctionRef`, the `Text` and the `Private` of a `Terminal` stayed in the store with no parent and were still returned by queries (never exported). They go with their reference, also when the commit's container prune deletes the reference, and a kept reference inside one (a `SourceRef` in a terminal's `Private`) goes with it instead of being cleared. A removal's report lists what a delete takes by itself, not what a reference holds, and no longer lists a kept reference inside a removed one as cleared.

## [0.11.0] - 2026-11-02

### Added

- **`isSclImportDiagnostic(diagnostic)` narrows a diagnostic to the typed `SclImportDiagnostic`** (it checks `source: 'scl'` and the code), so a `switch` on `code` reads that code's `meta` and, for an incoherent reference, its `related`. `INCOHERENT_REFERENCE_RELATED` holds the two wordings of a related element (`uuidTarget`, `pathTarget`); the type `IncoherentReferenceRelated` is exported.

- **Agent skill `dialecte-scl` ships with the package**, in `skills/`: the SCL business verbs, what the hooks keep coherent on every write and import, the reference registries. Its verb map and hook list are generated from the source. Install it for your coding agent with `npx @dialecte/cli skills sync`. Every SCL verb now carries a JSDoc summary and `@intent` tags (what a caller is trying to do), indexed in the skill's `references/api.md`; `npm run skills:check` fails when the skill cites what does not exist or a verb loses its summary or intent.

- **`ReportWarning` `satellite-not-placed`, `ReportInstance.satellitesNotPlaced`**: on a first placement of an application, what its roles refer to that is not placed, nor the role's reference to it — a variable applying to nothing the placement places or lands on, or a variable or a behaviour description inside a function the application stands on that holds no copy of it —; the report lists it on the application's instance and warns. `ReportWarning` becomes a union of codes (see Changed). `ExtractWarning` `satellite-not-placed` (`source`): a variable an application's role refers to that applies to nothing the extracted file holds, placed neither, nor the reference to it.

- **`ExtractWarning` tells what an extract did to a variable or a behaviour description it carried**: `satellite-moved` (`element`, `from`, `to`: written on another element than the copy of the one holding it, so what its relative paths start from moved) and `satellite-renamed` (`element`, `name`, `as`: numbered beside a sibling of its name, so what names it by its name names another). `extract.asd` now returns `{ warnings }` too (see Changed).

- **`extract.fsd({ placement: 'function-template' })`: an FSD whose function is a template with no level** (`FUNCTION_TEMPLATE_CANNOT_HOLD`, `SCL2004`). The function is written as a `FunctionTemplate`, its subfunctions as `SubFunctionTemplate`, in the document root's `eIEC61850-6-100` `Private`, each element in the namespace it is declared in there: a template that may be placed at every level. The dialecte writes in a function template the function's logical nodes (with what they specify), subfunction templates and equipment, and no `Private` yet: a function holding anything else at its own or a subfunction's level (a vendor `Private`, a subfunction's file reference, its own while its template link is kept), or classified in a category, is refused, nothing written (`meta: { tags }`), for the caller to leave those sections out or break the link. `transplant.deep` and `cloneTree` take `asTemplate` for it.

- **`resolution.sharedFunctions: 'merge'`: a first placement of an application stands on the functions it shares with another** (`SharedFunctions`, default `'clone'`; `instantiate.asd` takes `sharedFunctions` too). A function the application composes that the level it lands on already holds with an identical template reference — the composed function's uuid as its lineage, or the uuid of a function of the file made from the same template element — is taken instead of placed: the application refers to it, a role already allocating it is not given it twice, and the report lists the mapping. Several such functions are the consumer's to choose (`resolution.mappings`, `apply` refusing with `MAPPING_UNDECIDED` until chosen); none, the function is placed as before. Read for an application placed on its own (`verb: 'asd'`).

- **`dataModel.importTypes` takes `followers`: logical nodes the target holds that take the type their source names** (`TypeFollower`, `LogicalNodeRecord`). Each `{ source, target }` is pointed at the id its source's type resolves to through the closure (an equal type reused, a free id kept, a taken one forked), whatever it named before. The type a follower leaves is removed once nothing names it any more, with the types only it named; a fork takes back the id that frees, and so does a fork an earlier call with followers minted for the same content once its original id is free, every referrer following (a call without followers leaves forks as they are). A type only the followers named is so updated in place; one anything else names is left as it is, the followers moving to a fork.

- **`DecisionGroup.sideEffects`: what a removal does outside it** (`RemovalSideEffect`). A group that removes elements lists the references elsewhere in the project naming one of them, each `deleted` or `cleared` (a reference keeping its content: a signal input, a data setting), and the containers the removal or those deletions leave holding nothing, `deleted` with the references to them — what the delete hooks and the commit then do when the removal is accepted, read with the same rule, before anything is decided. Read only: nothing to decide, `apply` is unchanged.

- **`DiffReport.target`: what a report was made for** (`ReportTarget`, `ReportTargetField`, `ReportedElement`). `query.lifecycle.report` writes the record ids of the project and the template documents, the `verb`, the `ref` and the `anchor`, the `scenario` (`'template'` when none was asked for) and the `targetInstance` when one was asked for.

- **The report lists an addition that cannot be written: `DiffNode.identityCollision`** (`IdentityCollision`: `constraint`, `fields`, `collidesWith`). An element a template update adds that collides with one the instance holds on a key none of whose fields can be changed (an `LNode` the project added with the same class, instance, prefix, device and IED) carries it, and the report needs decisions. Its group can be skipped, or accepted with the removal of the project's element; `apply` refuses it otherwise with `IDENTITY_COLLISION` before anything is written.

- **`ReportInstance.variantsNotSelected`**: on the report of an application instance that selected functional variants, the template's variants it did not select (a variant the template gained since included). There is nothing to decide about them: they and what they bring are not added. **`transplant.deep` takes `leaveOut`**: the source records not cloned, with what they hold.

- **`extract.fsd`, `extract.asd` and `extract.ssd` take `as` and `templateLink` (`ExtractOptions`, `TemplateLink`).** `templateLink: 'keep'` keeps the element extracted an instance of the template it was made from (its `templateUuid` and `originUuid`), `'break'` breaks that link (see Changed: the default and what a break reaches). `as: 'new'`, the default, writes a new template as so far; `as: 'revision'`, a new revision of the template the element came from, is not available yet and is refused with `OPTION_NOT_AVAILABLE` (`SCL1009`, `meta: { option, value }`) before anything is written. The header of the file an operation writes is started by the new `tx.history.startFile({ as, filename, header, item })`, the one place that will write a revision too.

- **`baseQuery` on a fork: the previous revision of the file.** `query.lifecycle.report` and `tx.lifecycle.apply` (and `update.fsd` / `update.asd` / `update.ssd`) take it with `scenario: 'fork'` only (`LifecycleTarget` is now `LifecycleVerbTarget & LifecycleRevisionBase`). An element the project holds that the newer revision lacks is removed only when the previous revision held it; otherwise it is the project's own, listed as `target-only` and kept unless the consumer removes it. The previous revision is read once per report and per apply. A previous revision whose `Header` names another file than the newer revision's is refused with `REVISION_BASE_OTHER_FILE` (`meta: { fileUuid, baseFileUuid }`), a newer revision naming no file is not checked; another scenario given one is refused with `REVISION_BASE_WITHOUT_FORK` (`meta: { scenario }`). The report of a fork says whether it was given: `report.revisionBase` is `'given'` or `'absent'`.

### Changed

- **Every function exported from `@dialecte/scl/v2019C1` and `@dialecte/scl/v2019C1/test` is documented and indexed**: each carries a JSDoc summary and `@intent` tags, and is listed by entry in the `dialecte-scl` skill's `references/api.md` (and found by `dialecte api find`). The SCL test helpers that bind a core one (`assertValidSclXml`, `assertExpectedElementQueries`, `assertUnexpectedElementQueries`, `createSclTestRecord`) say what they bind for SCL.

- **Breaking: what the import has to say about a file comes back with that file, as diagnostics.** The import warnings were dropped by `@dialecte/core` before reaching the caller; each imported file's entry now carries them in `diagnostics` (`project.import(files)` entries, `project.importFile(file)`), `[]` when there is nothing to say. Each is a core `Diagnostic`: `code`, `severity`, `source: 'scl'`, `message`, `ref` (the element, and the attribute when it is about one), `related` and `meta`. `unresolved-reference`, `unsupported-xpath-reference`, `incoherent-reference` and `data-path-not-split` are `warning`s; `incoherent-path-names` and `derived-specification-naming`, a value written again on import, are `information`. The diagnostic of a reference points at its path attribute (`ref.attribute`); mapped data named by its uuid alone points at its uuid attribute, its `pathValue` that uuid. An `incoherent-reference` now names in `related` the element its uuid names, then the element its path names, each when the file holds it.

- **Breaking: the import warning exports are renamed to diagnostics.** `SCL_IMPORT_WARNINGS` is `SCL_IMPORT_DIAGNOSTICS` (`source` + `codes`, each with `severity`, `family` and `message`), `SclImportWarningType` is `SclImportDiagnosticCode`, `SclImportWarning` is `SclImportDiagnostic`, and `UnresolvedReferenceWarning`, `UnsupportedXPathWarning`, `IncoherentReferenceWarning`, `DataPathNotSplitWarning`, `IncoherentPathNamesWarning`, `DerivedSpecificationNamingWarning` are the same names ending in `Diagnostic`. On a diagnostic, `type` is `code`, `recordId` is `ref.id`, `details.elementTag` is `ref.tagName`, `details.pathAttribute` is `ref.attribute` (for a reference of the IED section named by attributes, the attributes naming its target, space-separated: `iedName ldInst prefix lnClass lnInst`), and the rest of `details` is `meta`.

- **Breaking:** requires `@dialecte/core` 0.8.0. The `Project` that `createSclProject` returns follows it: `project.import(files)` returns one entry per file (`{ status: 'imported', fileName, documentId, recordCount, diagnostics }` or `{ status: 'failed', fileName, error }`) and no longer rejects for one file; `project.importFile(file)` imports one file and returns it, or throws what failed (`PARSE_ERROR` for a malformed file); `project.close()` returns a promise. A caller that read `(await project.import([file]))[0].documentId` calls `project.importFile(file)`.

- **Breaking: the `Project` that `createSclProject` returns exports with one object, as `@dialecte/core` 0.8.0 does.** `project.export({ documentId, indent?, withDatabaseIds?, xmlDocument?, download? })` returns `{ file, filename }` (and `xmlDocument` when asked); it was `project.export(documentId, { withDatabaseIds, withDownload })` returning `{ xmlDocument, filename }`. `project.exportBlob({ blobId, download? })` likewise; it was `project.exportBlob(blobId, { withDownload })`.

- **Breaking (`@dialecte/scl/v2019C1/test`): the XML test helpers follow `@dialecte/core` 0.8.0.** `assertValidSclXml` takes one object, `assertValidSclXml({ xml, label?, requireComplete? })` (was `assertValidSclXml(xml, label?, { requireComplete? })`). `assertExpectedElementQueries` and `assertUnexpectedElementQueries` take XML text only, `{ xml, queries }`: a caller holding a page `Document` (the former `xmlDocument` target) serializes it, or reads the XML with `document.query.getSnapshot({ as: 'xml' })`. All three read XML the same way in node and in a browser, with libxml2: text that is not well-formed fails as `<label>: malformed XML - <line>:<column> <reason>` (`queried XML` for the query assertions), and a failed query says, in labelled lines, which steps matched, the step that failed, where the last match sits and what the failing step finds there without its predicates.

- **Breaking (`@dialecte/scl/v2019C1/test`): `assertCoherentSclReferences` returns a promise.** It reads the fixture's elements through a test project of its own (the XML imported with no hook, so nothing repairs a reference) instead of the page's `DOMParser`, so the test helpers run in node as in a browser: `await assertCoherentSclReferences({ xml, label? })`. A call left un-awaited checks nothing. A fixture that is well-formed but that the import refuses (one record id given twice) now throws the refusal; text that is not well-formed still gives no reference violation (the structural check reports it). The `empty` violation is gone: an empty attribute is stored as absent. `runSclTestCases` checks the references of every case's fixtures in a `beforeAll` of the suite (bounded at 2 minutes), not while the suite is collected: an incoherent fixture fails the suite's cases, all incoherent cases named in one error.

- **The test helpers need no browser; this package's tests run in node by default.** `@dialecte/scl/v2019C1/test` reads XML with libxml2 and documents through the store, so a consumer can run its SCL tests in node: its node project's setup calls core's `useTestStorage({ type: 'inMemory' })`. Here, `npm test` runs every unit test in node on the in-memory store (the `node` project), then the browser-only list in Chromium (`browser`); `npm run test:browser:all` runs the whole suite in Chromium (`browser-all`), as a pull request does. The fast mutation tier (`npm run mutants:fast`) runs that same node tier, with no browser stand-in, and the full tier the `browser-all` project; the dev dependencies `jsdom`, `@types/jsdom`, `xpath` and `fake-indexeddb` are gone. The tiers and which command to run when are on the test helpers page (Test tiers of this package).

- **`ReportWarning` is a union of codes** (breaking for a caller reading `reference`, `source` or `lineage` without narrowing on `code`): `reference-paired-by-name` beside `satellite-not-placed` (see Added).

- **In an SSD placement, what a level of the unit holds is listed with the frame and travels with it** (breaking for a consumer deciding a placement group by group). A variable a level of the unit holds applying to a level the unit lands on (a bay's variable applying to its voltage level) was dropped unless a role referred to it: it now travels with the level holding it, whatever refers to it. One an application's role refers to that a level of the unit holds, applying within the placement, is listed in the frame's group, no longer the application's: skipping the application keeps it, the role only makes the application's group depend on the frame's. A placed function it applies to still lists it first.

- **`ExtractWarning` is a union of codes** (breaking for a caller reading `counts` without narrowing on `code`): `sections-not-carried` beside the satellite codes (see Added).

- **An extract keeps the template link by default; breaking it reaches what came with the element's instance** (breaking for a caller relying on the link broken by default — pass `templateLink: 'break'`). A copy of an instance keeps the `templateUuid` / `originUuid` it was made with; the user may remove them. `templateLink` now defaults to `'keep'`. `'break'` removed the lineage of the element extracted alone, leaving what it holds naming elements of a file it no longer recorded: it now reaches the elements below it and, for an application, the functions it composes, unless an element records a source file of its own (a subfunction placed from another FSD, an application or a function placed from its file), which keeps its lineage and its file reference with what it holds. For an SSD it reaches the element extracted, what it holds and the functions its applications compose (an application placed from its file keeps its lineage, and so do the functions it composes). With the link kept, `extract.fsd({ placement: 'function-template' })` of a function placed from an FSD is refused (its file reference has no place in a function template): pass `templateLink: 'break'`.

- **`extract.fsd` places the function at the level it sits at: `placement`** (`FunctionPlacement`; breaking for a caller relying on every FSD function sitting below the `TEMPLATE` substation — pass `placement: 'substation'`). The level a function sits at in an FSD is the highest level it may be placed at; every extracted function was written below the `TEMPLATE` substation whatever its level, so a bay function's FSD said it could sit at substation level. `'source-level'` (default) writes it below the `TEMPLATE` level matching its own (a subfunction at its function's; a function in a line or a process is refused with `OPTION_NOT_AVAILABLE` for now), `'substation'` below the `TEMPLATE` substation, and `'function-template'` as a template with no level (see Added).

- **An extracted FSD or ASD keeps everything a function holds; the caller leaves sections out: `extract.fsd({ sections })`, `extract.asd({ sections: { equipment } })`** (`FunctionSections`, `FunctionSection`, `FsdExtractOptions`, `AsdExtractOptions`; breaking for a caller relying on the content dropped before — pass the sections to leave out). `extract.fsd` dropped the data specification (`DOS`), the labels, the logical nodes' inputs and outputs, the process resources, the power system relations, the behaviour descriptions, the variables and the equipment of the function, and `extract.asd` the equipment of the functions it composes. Each is optional content of a function an FSD may carry: every section is written by default, each left out at every depth when set `false` (`dataSpecification`, `labels`, `inputs`, `outputs`, `processResources`, `powerSystemRelations`, `behaviorDescriptions`, `variables`, `equipment`, and `categories` for the categories classifying the function).

- **An SSD extracted from a substation is a template: the substation is named `TEMPLATE`, its voltage levels are its units** (breaking for a caller expecting the substation's name in the file). `extract.ssd` renamed only the levels above the element extracted, so a substation kept its project name and the file was no template. Its voltage levels keep their names: a project instantiates one of them, naming it when the file holds several (`SSD_SCOPE_AMBIGUOUS` lists them otherwise).

- **`extract.ssd` returns its warnings as data: `ExtractWarning`** (breaking for a caller reading `warnings` as strings). Each is a `code` and what it counts, for the caller to word: `{ code: 'sections-not-carried', counts: { IED, Communication } }` when the source holds sections an SSD does not carry yet.

- **`ReportMapping.selectable` and `MAPPING_CHOICE_NOT_SELECTABLE` (`SCL1002`) are removed** (breaking for consumers reading `selectable`, or naming the error key in their own wording). Every mapping a report lists is the consumer's to choose, unless it is `locked`; a choice for a mapping is refused only as unknown, locked, or not a candidate.

- **What the project made keeps what it gives the instance** (breaking for a caller relying on an update withdrawing it). A `Variable`, a `BehaviorDescription`, a category or a role carrying no lineage — the user's own, or a project element a template was mapped onto earlier and has since dropped — lost its references to the instance on a template update, removed with the instance's change, and a variable left applying to nothing went at the commit. They are now listed as the project's own (`target-only`, a decision of their own) and kept unless the consumer accepts their removal, as a fork given its previous revision already read them; a reference to an element the update removes still goes with it, listed in the removal's `sideEffects`.

- **A reference whose uuids disagree with the template's no longer pairs with it by name, unless asked: `resolution.referencesByName: 'placeholders'`** (`ReferencesByName`, `DiffNode.pairedByName`, `DiffReport.warnings`, `ReportWarning`; breaking for a consumer relying on the engine recovering a placeholder-lineage project by name). A reference of the project naming an element whose lineage is not the template element's uuid was paired with the template's reference by the names of their targets, whatever the lineage said: a renamed target and another of the same name could swap, silently. It is now the project's own reference and the template's is new. With `'placeholders'`, read by `report` and `apply` alike, a reference pairs by name only where its target carries a lineage `checkTemplateUuids` flags (one value on elements of several types, or naming an element of another type); each such pairing is marked on its node and listed in `report.warnings` (`code: 'reference-paired-by-name'`, the reference, the template's, the placeholder).

- **A `Variable` and a `BehaviorDescription` belong to the instance they configure** (breaking for a caller relying on the shared-by-name merge, or reading them in `report.mappings`). A template's variable or behaviour description applying to what it places is cloned for each placement — no longer mapped onto, nor merged into, an element of its name the project holds — and numbered when its name is taken where it lands (`VXCBR_1`), as any placed element; an update reconciles each instance's own one, never one of another instance. They are no longer listed in `report.mappings`, and a choice sent for one is refused as an unknown mapping (`MAPPING_CHOICE_UNKNOWN`). A project where an earlier version made one variable for several instances is read as it is: each instance compares its own references, nothing else is listed.

- **A bound `LNode` takes the type a newer template gives it; `resolution.boundLogicalNodeTypes: 'keep'` keeps it** (`BoundLogicalNodeTypes`; breaking for a caller relying on a bound `LNode` keeping its type — pass `resolution: { boundLogicalNodeTypes: 'keep' }` to `query.lifecycle.report` —, and for an importer of `LOCKED_LNODE_ATTRIBUTES`, removed: the binding is `LNODE_BINDING_ATTRIBUTES`). The type of an `LNode` is what it was specified with, and its implementation does not change it: a template update changing the type of an `LNode` bound to an IED now lists it in `typeChanges` and, accepted, brings it as for any other `LNode`, its binding kept. With `'keep'`, read by the report, the change is listed in `keptAttributeChanges` (`reason: 'bound-logical-node'`) and not applied; `apply` writes the type changes the report lists, so it needs no option.

- **Units of an SSD template linked by a reference are one element** (breaking for a caller naming one level of such a template and expecting it alone, `DiffReport.scopeUnits`, `SSD_SCOPE_AMBIGUOUS` candidates gain `linked`). A transformer bay drawn across two voltage levels, the breaker of one on a node of the other, could only be placed one level at a time, and the second placement left that terminal naming nothing. At the first named level of the template, units joined by any registered reference are now grouped, transitively, into one element: naming one of them, or their scaffolding when they are all it holds, places and updates them together in one placement, rooted at the `TEMPLATE` scaffolding, which lands on the project's level of its kind, each level where the level mapping says; the reference names the element placed from the other unit. The report lists them in `scopeUnits`. Units with no reference between them still wait for a choice; each candidate of the refusal is one element (`linked` names the units that come with it), and the units the chosen element does not hold are left out. An instance placed one level at a time, updated from a revision that now links its levels, gets the other level placed with it.

- **A template update no longer removes a level another template placed in the unit; a level the template dropped is kept unless its removal is accepted** (breaking for a caller relying on the fast track removing such a level). A bay a bay template placed in a voltage level a voltage level template had placed was listed `removed` on the voltage level template's next update, and deleted on its fast track: its lineage, naming the bay template's level, is absent from the voltage level template. A level of the topology the template does not hold is now listed as the project's own (`target-only`), kept unless its removal is accepted — a level the template dropped included: what a level was made from does not tell which template placed it. A fork given its previous revision still removes a level that revision held.

- **An SSD operation acts on the element `ref` names; a template holding several units at its first named level is refused until one is chosen** (breaking for a caller naming the `TEMPLATE` scaffolding of such a template, or a level other than the one it meant). `query.lifecycle.report` and `tx.lifecycle.apply` with `verb: 'ssd'`, and `instantiate.ssd` / `update.ssd` with `scopeRef`, read the scope from the element named: a named `Substation`, `VoltageLevel` or `Bay` is placed or updated as it is, so a template of several bays is placed one chosen bay at a time. The `TEMPLATE` scaffolding is walked down to the first level holding a named element only when it is the element named (or, for the two verbs, when nothing is): there one unit is the scope, as before, and several are refused with `SSD_SCOPE_AMBIGUOUS` (`SCL2003`), `meta.candidates` listing each (`{ tagName, id, name }`) for a consumer to offer as a choice. An element named that the template does not hold is refused with `TEMPLATE_ROOT_NOT_FOUND`. Before, `ref` was not read and the first unit of the file was placed, the others silently left out.

- **`apply` refuses a report made for another target, or naming an element deleted since** (breaking for a caller applying a report to another target than the one it asked the report for, or applying a report it built itself). A report applied to another project, template, layer, template element, place, operation or instance than it was made for was applied all the same, and a mapping onto an element deleted between the report and the apply became the creation of a new one. `tx.lifecycle.apply` now refuses, before anything is written, a report whose `target` differs from what it is asked for or that carries none (`REPORT_TARGET_MISMATCH`, `SCL1013`, `meta: { field }`), then a report naming an instance, or an element a mapping or a mapping choice lands on, that the document no longer holds (`REPORT_STALE`, `SCL1014`, `meta: { element, kind }`). A report applied a second time is still safe.

- **`apply` refuses decisions the report does not list** (breaking for a caller passing a decision map kept from another report). A decision whose key no group of the report carries was ignored, and a group depending on a group the report does not list passed as if it depended on nothing: decisions taken on a stale or another report wrote something else than what was reviewed. `tx.lifecycle.apply` now refuses them before anything is written, with `DECISION_UNKNOWN` (`SCL1011`, `meta: { groupId }`) and `DECISION_DEPENDENCY_UNKNOWN` (`SCL1012`, `meta: { groupId, dependencyId }`).

- **A template update keeps what an instance configures: a behaviour description's file and a variable's value** (breaking for a caller relying on the template's value being written). Each instance of a template gets its own behaviour file and its own variable values (set for it, or by the variant it selected); an update from a newer template overwrote them with the template's. `update.fsd` / `update.asd` / `update.ssd` now leave `BehaviorDescription@fileReference` and `Variable@value` of an instance as they are and list a template's change of them on the node's `keptAttributeChanges` with the new reason `'instance-configuration'` (`KeptAttributeReason`): no decision, the instance stays `upToDate`, `report.summary.kept` counts it. A fork writes them (they are the file's), and an element an update adds carries the template's.

- **A Header lists a file version once.** Placing an SSD whose version and revision the project's `Header > SourceFiles` already lists (the same bay template placed a second time) no longer appends a second `SclFileReference`: the list holds the files imported, in the order they first were.

- **Extract breaks only the template link of the element extracted.** The function, the application or the level extracted loses its `templateUuid` and its `originUuid` (an application kept its origin); for an SSD the `TEMPLATE` levels above it carry none either. What it holds or refers to keeps its lineage, where several lost theirs: the categories of a function, the roles and the other elements an application refers to (a behaviour description, a process resource), the applications, equipment and own content of an SSD level; functions, subfunctions and the categories of an application kept them. A template made from an instance still names the templates its parts came from.

- **`tx.identity.writeIdentity` decides the whole lineage of a clone, and its `strip` and `preserve` modes take what they need** (breaking for a caller of `strip` or `preserve`). `stamp-template` writes the origin of an element whose schema carries one from the source's `originUuid`, else its `templateUuid`: a template's origin is conserved in the instance, where it was left to what the clone copied. `strip` takes `unlinked`, the source record ids of the elements whose template link is broken: those lose `templateUuid` and `originUuid`, every other element keeps its lineage (it stripped every element). `preserve` takes `sourceQuery` and `sourceRoots` (the source elements cloned, as the source holds them, a retagged root included) and keeps the lineage only where it still holds: an element whose nearest ancestor carrying a lineage is part of an instance (a `templateUuid`, and not a `Substation`, `VoltageLevel` or `Bay`) keeps it only when its new parent carries the same `templateUuid`, and loses it otherwise, with what it holds.

- **The package's mutation runs take the tests in node, in two tiers, and its equivalent mutants are recorded** (tooling of this repository; nothing changes for a consumer). `npm run mutants:fast -- <files | file:line-line> | --diff <ref>` runs every unit test in node (a `mutation` vitest project, only when the driver asks for it: jsdom, `xpath` and `fake-indexeddb` stand in for the browser), and StrykerJS's vitest runner runs, per mutant, only the tests that reach it, in warm workers whose test files share their modules; a mutant that timed out runs again alone and stays a timeout only when it times out again. `npm run mutants:full` runs the browser `unit` project on each survivor left unlisted; `npm run mutants` runs both. A survivor is killed by a test or recorded with its reason in `scripts/mutants/equivalent-mutants.json`: the gate fails on an unlisted one (`--record` writes them with an empty reason to fill); `npm run test:mutants` runs the gate's own tests. New dev dependencies: `@stryker-mutator/vitest-runner`, `jsdom`, `@types/jsdom`, `fake-indexeddb`, `xpath`.

- **A fork without `baseQuery` no longer deletes what the newer revision lacks** (breaking for a fork caller relying on it). It lists such an element as the project's own (`target-only`, suggested `skip`), keeps it unless its removal is accepted, and the report's `revisionBase` is `'absent'`: nothing tells an element the newer revision dropped from one the project added. Give the previous revision to have the dropped ones removed. A reference without a uuid of its own (a `FunctionRef`, an `AllocationRoleRef`…) the newer revision lacks is still listed as removed: it is part of the element holding it.

- **`instantiate.ssd` takes `scenario` instead of `mode`; `instantiate.fsd` and `instantiate.asd` take `scenario` too** (breaking for a caller of `instantiate.ssd` passing `mode`). `mode: 'keep'` is now `scenario: 'fork'`, `mode: 'stamp-template'` the default `scenario: 'instantiate'`. On `instantiate.fsd` and `instantiate.asd`, `scenario: 'fork'` places the file's elements with their own uuids, no lineage and no provenance; without it they place a new instance as before.

- **`apply` without decisions writes each group of the report at its suggested action** (breaking for a caller that applies without decisions). On the fast track, `tx.lifecycle.apply` with no `resolution.decisions` wrote every change the update verb reached, without the report's gate: a reference the report kept unchanged was deleted when the template did not hold it — the second `FunctionRef` of an application instance composing two instances of one function, on an update that changes nothing. It now writes what the report lists, each group at its suggested action, as with an empty decision map: an element the project added is kept, a reference the report kept stays. The full track is unchanged: without decisions it writes nothing.

- **The test runner and `createSclTestProject` check the documents a test leaves** (`@dialecte/scl/v2019C1/test`; breaking for tests built on them). After the act of a `runSclTestCases.withExport` / `.withoutExport` case, and when a test using `createSclTestProject` finishes, the source and target documents are checked: structure, an XSD validator (libxml2) against the SCL and 6-100 schemas, unique keys among siblings, coherent references, unique uuids and template uuids of one type. A case whose act writes a document with an invalid structure or value, a duplicate key, an incoherent reference or a duplicate uuid fails, with every violation it added; what the input already held, or what another document of the project holds, does not count. `allowInvalidOutput` (on the case or as a `createSclTestProject` parameter) gives the reason and the violations the case may leave (`{ reason, violations: [{ check, code? }] }`): only those are tolerated, any other violation still fails the case, a tolerated one the case no longer leaves fails it too, and an empty reason or list is refused. `createSclTestProject` now destroys its project when the test finishes: a test must not call `project.destroy()` itself, and must call it inside a test. `collectSclOutputViolations` (which reports the violations, each with its check and `code`, and the checks that ran), `assertNoNewSclOutputViolations`, `isSclXsdConfigured`, `SCL_OUTPUT_CHECK`, `SCL_XSD_CODE` and the types `SclOutputViolation`, `SclOutputReport`, `SclOutputCheck`, `SclOutputBaseline`, `SclOutputOptOut`, `SclOutputTolerance`, `SclXsdCode`, `SclXsdReport` are exported. The validator and the test runner are optional peer dependencies (`libxml2-wasm`, `vitest`): a package using the test helpers installs them, keeps its own copy of the IEC schema files (not shipped) and says where they are with `configureSclXsdSchemas({ baseUrl })` or `({ load })` in a setup file (`SCL_XSD_FILE_NAMES` lists them, type `SclXsdSchemaSource`); without schemas the XSD validator does not run, nothing fails for that reason, and the report and a failure say the document was checked without it.

### Fixed

- **A fork, an update or an instantiate no longer reports or writes a change for an attribute holding its schema default.** An attribute written with its default (`lnInst=""`, `desc=""`, an LNode's `iedName="None"`) and the same attribute left out compare equal: `@dialecte/core` 0.8.0 keeps an empty value where 0.7.0 dropped it, so a revision that wrote `lnInst=""` and one that left it out read as a modified LNode.

- **The references of an imported file are resolved against that file only.** The import kept what it collected (paths, pending references, LNode namings) in one state per project, emptied by hand at the end of each file; it is now one import session per file, created by core when the file is imported, so nothing of one file, a file that failed included, reaches another.

- **What travels with a placement is listed once, as written.** A variable or a behaviour description applying to two functions of one placement was listed with each, with its references to that function only, and written once with both; one a placed function holds, applying to another, was listed twice. It is listed once — with the primary holding it, else the first it applies to —, its references naming what the placement places. What an application's roles refer to (a variable, a behaviour description) is placed whole and listed with the first primary of the placement it applies to (a function, an application), else, in an SSD placement, with the frame when a level of the unit holds it or it applies to the unit's levels, else with the application: it was written naming elements the placement does not place, and not listed. The application's group depends on the group listing it: skipping the application keeps it — two applications referring to one variable of their bay can each be skipped —, leaving out that primary while keeping the application is refused. Its references name what the placement places or the level of the template it lands on (the bay it lands on, a level of the project a template level is mapped onto, a copy): they were dropped, leaving a variable applying to nothing — an invalid file. A variable then applying to nothing is not placed, nor the role's reference to it, and the report and the extracts warn (see Added); a variable is never made to apply twice to one project element: a reference landing on an element a copy of it the project holds (or a copy of a satellite of its template reference) already applies to is left out, and when none remains nothing is written and the role names that copy — a bay placed twice on one voltage level, an application placed twice on one bay, merged onto a function the project holds, wrote a second copy applying to the same element; the same holds for what a placed function carries, which is scoped as what a role refers to (a variable it carries left applying to nothing is not placed, nor the role's reference to it, and warned); one the project already holds by its uuid is neither listed nor placed again — nor is anything applying to the placement the project holds by its uuid (a fork wrote it a second time, two elements of one uuid); one inside a function the application stands on, or applying to nothing but it, is the copy the project holds — it was placed a second time — or, when it holds none, not placed, and warned. What a role refers to is placed with what applies to the placement, by one rule: in the copy of the element holding it when the placement placed that element, else at its structural level, numbered beside a sibling of its name — two of one name from two bays landed side by side on the bay of an extracted ASD, an invalid file. One a line or a process holds goes to the outermost level of the structure, told moved (it refused the placement); one inside a function stood on is matched by its template reference too, as the function was. `extract.asd` lands the levels above the application on the TEMPLATE levels of the file: a variable applying to its bay applies to the file's bay (it was dropped). With `templateLink: 'break'` both extracts break the link of what the roles refer to too, as of the rest of the instance (an application placed from its own file keeps it, and so does what it refers to). In an SSD placement, what applies to a function the unit's applications compose outside the unit is written too, that function is placed as its own group is decided, whatever the applications composing it decide (a function needs no application), and what the scaffolding holds of its own, left out, is not listed; what a role refers to inside a function of the unit is placed once, with that function (it was placed a second time beside it when the function came after the application).

- **The report of an SSD placement lists once a function two applications of the unit compose.** Each application's report listed the functions it composes, so such a function was listed twice and written once. It is listed with the first application; the second one's group depends on it.

- **What a level of an SSD scope holds travels with it.** A variable or a behaviour description a bay, a voltage level or an equipment of the scope holds was left out by an SSD placement (`instantiate.ssd`) and an SSD extract (`extract.ssd`): listed by the report when it applied to a function, and not written. Both now carry it, one per instance, in the element holding it, applying to what the operation places or the levels it lands on — whatever refers to it; `extract.ssd` also brings what applies to the scope from outside it, and with `templateLink: 'break'` breaks their link too. One an application's role refers to is placed once, where it is held. `extract.ssd` and `extract.asd` number one placed at a structural level whose name a sibling carries — one placed in the copy of the element holding it keeps its name — and tell each satellite they move or number (see Added).

- **A variable or a behaviour description applying to a function an application composes travels with the application.** Placed (`instantiate.asd`, an update placing it) or extracted (`extract.asd`), an application brought what applies to itself only: a variable or a behaviour description outside the function applying to it was listed by the report and not written, and left out of the extracted file. Both now carry it, one per instance, applying to what the operation places; with `templateLink: 'break'` an extract breaks its link too, unless it applies only to a function placed from its own file, which keeps its own.

- **An extracted SSD holds once a function two applications of the scope compose.** Each application placed the functions it composes, so the second placed the function again beside the first — and what it holds that its roles refer to: two functions of one name in the bay, an invalid file. The function is placed once and both applications refer to it and to what it holds.

- **`extract.asd` names the file after the application extracted.** It read the name in the document being written, where the application is not yet: every ASD was named `ASD_Unnamed_Application` (`Header@id` `asd_unnamed_application`).

- **A first placement onto an element the project shares writes what its report lists.** A role, a category or the own content of an SSD level mapped onto the project's element was poured in by three rules: a role's every allocation was cloned (twice when two applications of a file mapped onto it), a category's sub-categories were paired with the project's otherwise than the report paired them, and a function placed by an update where it had no instance had its classification reported unchanged while the apply added it. One rule now writes it and the report reads it: a container lands on the project's child of its lineage, else of its name, nothing the project holds is rewritten, and each reference is the placement's own — not written twice when the project's container already names the very element it names.

- **A reference a placement writes into a shared element names only what the placement places.** A template's category also classifying a function the operation does not place, a role allocating a function the application does not compose (or one the consumer left out), a variable applying to another function of the file: placing or updating the one wrote every reference of the shared element, and those to elements it did not place named nothing in the project. `report`, `apply`, `instantiate.fsd` / `asd` / `ssd`, `update.fsd` / `asd` / `ssd` and `extract.fsd` / `asd` (a category or a role written into the file names what is extracted) now read one scope — the function and what it holds, the application and the functions it composes, the unit of an SSD, but what is left out — and a reference outside it is neither listed nor written. A reference of that kind the instance already holds is compared as any.

- **An SSD placement writes the name the consumer chose for a shared element it creates.** `instantiate.ssd` (and `apply` placing an SSD) created a role or a category the consumer asked for under a name of its own (`create: { name }`) under the template's name; the report announced the chosen one. It now names it as `instantiate.fsd` and `instantiate.asd` do: the chosen name, made free on the level of the frame the element lands on.

- **A shared element the template retires stays while something outside the instance updated names it.** Updating one instance of a template that retired a `FunctionCategory` deleted the category with the references of the other instances still classified by it; a retired `AllocationRole` another application refers to was reported removed and kept. Now the element stays while another instance, another template's instance or the project names it (a category's `FunctionCatRef`, a reference to a role) — only the references the updated instance gave it are listed as removed and removed when accepted — and goes whole otherwise. The report and the apply read one answer, and the apply writes what the report lists.

- **An update compares a logical node's type by what it holds, and brings a type the template changed** (`DiffNode.typeChanges`; breaking for a caller reading `lnType` in `attributeChanges`). `lnType` names a type of each document, but an update compared and wrote it as a value: an instance placed on an equal type the project held under another id was moved, on any later update, onto the template's id — a type the project did not hold, or an unrelated one holding that id —, and a type the template changed under the same id (a data object gained) was neither listed nor brought. A type reference is no longer among the compared attributes: the type each side names is compared by its content, an equal type under another id is no change, and a changed one is listed as `typeChanges: [{ name: 'lnType', before, after }]` on the element, decided with its group. Accepted, the template's type is brought through its closure and the element pointed at the id it resolves to; the type it leaves goes once nothing names it, so a type only the template's instances name is updated in place and one anything else names is left as it is, the instance moving to a fork.

- **A cloned `LNode` naming an IED takes the type its template names.** `dataModel.importTypes` left the `lnType` of a cloned `LNode` whose `iedName` named an IED (a template LNode specified on a specification IED) out of its repointing: placed in a project holding another type under the template's type id, the `LNode` pointed at the project's type, a different data model, and releasing its binding afterwards did not repair it. Every clone is now repointed to the type the import resolved.

- **Deleting an element takes the references to the references it deletes.** The delete hook removed the references naming a deleted element; one of them named in turn — a `PowerSystemRelation` deleted with the equipment it relates to, named by an application's `PowerSystemRelationRef` — left that reference naming nothing. It now goes too, and a parent losing several references is written once.

- **A text the template changed reaches the instance like an attribute** (`DiffNode.textChange`, `TextChange`). The diff compared attributes only: a template changing the text of an element holding text only — a `BayType`, an `IEDName`, vendor data a `Private` holds as text — listed nothing and wrote nothing. Such an element is now `modified`, its `textChange` gives the instance's text and the template's (surrounding whitespace aside), and the apply writes it when its group is accepted, keeps it when declined. A vendor `Private` is paired with the instance's of the same `type`: one the instance lacks is added, one only the instance holds is kept.

- **No write leaves a container it emptied** (breaking for a caller importing `REF_CONTAINERS`, which is removed, or relying on `tx.cleanUp.pruneEmptyContainers` keeping what its tag list did not name). Deleting the last `PowerSystemRelation` of a function left an empty `PowerSystemRelations` and an empty `Private`; deleting the element a category's last reference named left the category without a reference, which the schema refuses; a template update retiring the last category of a level left an empty `Private` on it; instantiating a typical whose logical nodes name no type wrote an empty `DataTypeTemplates`. What a transaction leaves holding nothing now goes at its commit, whatever wrote (a delete, an apply, an extract), with what refers to it: a container whose content model needs a child it no longer holds — a list with no identity of its own (`PowerSystemRelations`, `ProcessResources`, `LNodeInputs`, `DataTypeTemplates`, `Communication`…) or a set of references (a category and its `FunctionCatRef`, a `Variable` and its `VariableApplyTo`) —, and a wrapper of the dialecte's own elements left with no child and no text, walked up. An element of its own that needs a child (an `IED`, an `LNodeType`, an `Application`) is the project's to remove; a `Private` of another `type` is a tool's data and stays, empty or not; a level of the topology is never removed. The same transaction can fill a container again before it commits: a category whose reference is swapped stays. `tx.cleanUp.pruneEmptyContainers` applies the rule to the whole document (the extract clean-up runs it), its set read from the definition instead of a tag list: it no longer removes an empty `ProcessResource`, which the schema allows. `DataTypeTemplates` is written with the first type imported.

- **What the consumer's step writes after an apply is held to the uniqueness rules** (breaking for a step relying on a duplicate it writes being kept). After `resolution.afterApply`, only the applications and functions the apply placed and the step renamed were made unique again: a bay the step renamed to a name taken beside it, or an element it created, stayed a duplicate. Every element the step creates, or whose key it changes, is now checked where it sits: numbered on the key's editable field, refused with `IDENTITY_COLLISION` when the key has none. A duplicate the project held before, on a key the step did not touch, is left as it is.

- **A refused or failed apply leaves the report clean, and an undecided mapping is refused before anything is written.** `tx.lifecycle.apply` refused a mapping left to the consumer only when it reached the element, after earlier instances were written, and a failure left the `appliedRef`s of what it had written on the report although the transaction was rolled back; an apply that wrote nothing (decisions still to take) kept those of an earlier run. A mapping the report leaves undecided, that the consumer did not choose and that does not follow from a choice for a level above, is now refused with `MAPPING_UNDECIDED` before the first write — one decided for an instance whose every change is skipped excepted, nothing being written for it; an apply that fails forgets the `appliedRef`s it filled, and one that writes nothing forgets those of an earlier run.

- **An element the lifecycle writes beside one of the project sharing its whole key is refused** (breaking for a caller relying on the duplicate being written). A key none of whose fields can be changed — the class, instance, prefix, device and IED of an `LNode` under a function — was left as it was when an operation wrote a second element of that key in the same place: a template update gaining an `LNode` the project had added by hand wrote it beside the project's, two `LNode`s of one key, a file the schema refuses. Every operation placing an element now refuses it with `IDENTITY_COLLISION` (`SCL1010`, `meta: { constraint, fields, element, collidesWith }`), nothing written; an update reads it once its removals are written, so a template replacing an `LNode` by another of the same key, or the project's `LNode` removed in the same apply, goes through.

- **A template update respects the functional variants an instance selected.** An application instance whose variants were selected when it was placed holds only what that selection leaves: one variant of each group, no `FunctionalVariantRef`, and none of the elements, subfunctions and references the selection removed. An update compared it with the whole template and offered back everything the selection had removed — markers, variants, references, subfunctions and their logical nodes — and accepting the update put them back. `report` and `apply` now read the selection from what the instance holds (a set of variants the template holds several of and the instance one) and compare the instance with the template as that selection reads it: what the selection leaves out is neither listed nor written, a change of what it keeps still reaches the instance, a new element it keeps is added without the markers it consumed. An instance holding several variants of a set (or none) has selected nothing yet and is updated as before; a fork reads no selection.

- **An element an update adds inside a `Private` is written inside the instance's `Private` of the same type.** The update compares the template and the instance through their wrappers, and added what the template holds in one directly under the instance element: the elements a tool keeps in a `Private` of its own under a `Labels`, added by a template update, were written as direct children of `Labels`, a file the schema refuses. It now lands in the instance element's wrapper of that `type`, created with the template wrapper's attributes when the instance has none: a wrapper whose type is not the namespace of what it holds keeps its type.

- **An element of another namespace than its parent's is written inside the parent's `Private` of its type.** It landed beside the wrappers in two cases, leaving a file the schema refuses: under an SCL element whose first `Private` is of another type (the `FunctionSclRef` a placement or an update writes on a function carrying a vendor `Private`), and under an element of the 6-100 namespace (a tool's element added to a `Labels`). It now lands in the parent's `Private` whose `type` is its namespace prefix: the one the parent holds, never one of another type, a new one otherwise.

- **A function an application gained is placed when its placement is accepted, even when the reference to it is declined.** An ASD update placed such a function only for an instance one of whose own changes was accepted: accepting the placement alone placed nothing, while the report offered it and a first placement honours it. The placement now follows its own decision; taking a function already standing there, or choosing one, still waits for a change to the instance.

- **The provenance of an instance follows a template update.** After an update from a newer revision, the instance's `FunctionSclRef` / `ApplicationSclRef` still named the revision it was placed from, and the project's `Header` did not list the newer SSD: `reference.query.getProvenance` gave the former version. `update.fsd` and `update.asd` now bring the instance's own reference of that file to the newer `version` / `revision` (one reference per file, in place), unless every change the update brings to the instance — and to the functions an application composes — is declined; an application's functions keep the references of their own files. `update.ssd`, template or fork, appends the newer revision to `Header > SourceFiles` after the ones listed. `reference.writeProvenance` is the one writer of both: a placement of an element that already records the file rewrites that reference instead of adding a second one.

- **Extract keeps the file references of what the template holds.** An extract dropped every `FunctionSclRef` / `ApplicationSclRef` of the content, while it kept the `templateUuid`s beside them: a subfunction placed from another FSD, a function inside an application, an application inside an SSD named a template uuid without the file defining it. Only the element extracted loses its own reference (with `templateLink: 'break'`, the default); every element below it keeps its own. `reference.query.findOwnProvenance(reader, { element })` lists the references an element records for itself, `tx.reference.removeOwnProvenance({ element })` removes them.

- **An instantiate and an update conserve the origin lineage of what they place, and a fork its whole lineage.** The clone of an application, of an allocation role or another element an application refers to (a behaviour description, a process resource), and of a level and its own content dropped the `templateUuid` / `originUuid` the template element carried before the instance was stamped: an instance of an ASD application had no `originUuid` even when the application was made from another file, and the ASD → SSD → project chain was cut at the first step; a first fork, or an SSD used as the project's base, lost the lineage of its applications, roles and levels, so the next update found no instance and placed duplicates. A clone now copies the lineage as the template holds it and the identity is written once: a new instance records the template element as its `templateUuid` and conserves its origin (`originUuid`, else the template element's own `templateUuid`, on the elements whose schema carries one); a fork keeps it as the file holds it.

- **An update removes the applications and functions the newer template or revision dropped; a function another application still refers to is kept.** An SSD update reconciled only the applications and functions the newer template holds: one it dropped stayed in the project, unlisted. An ASD update removed only the reference to a function the application no longer composes, leaving the function behind with the template's lineage. Both are now listed as removals — a function after the references to it, in every instance of the application, and after the dropped applications composing it — and removed when accepted. Only what sits on the levels of the unit counts: a level another template placed there (a bay-typical in a voltage level), or a level of the project the unit was mapped onto, keeps what it holds. A function another application of the project still composes is kept and not listed, and so is an element recording a file of its own (placed from that file, not as part of the template). In a fork, the previous revision decides (`baseQuery`): without it they are listed as the project's own and kept.

- **An SSD holding only levels and equipment is updated where it was placed instead of being placed again.** With no application and no function, nothing told the update the template was placed already: every update placed a second bay (`Feeder_1`), and a fork placed it again with the same uuids. The update now finds the level the template was placed on, as it does for the levels of an SSD with applications, and reconciles it.

- **A fork applies the renames of the newer revision, and every path naming the renamed element follows.** A function, a subfunction or any element the newer revision renamed kept its former name, and the report did not list it: the project no longer matched the file, and the paths naming it (a `FunctionRef@function`, a `SourceRef@source`) named the former name. A fork now lists the rename as a `name` change and writes it, the paths following; a name a sibling of the project already holds is numbered, as on a placement, and the report lists the name written (`Ctrl_1`). The renames of one parent are written before any is numbered: two elements trading names need no number. A template update still leaves the names the project's.

- **What the project added below an element an update changes is kept.** Such an element (a `DOS` added to an `LNode`, an `LNode` added to a function) was a companion of the change to the element holding it: accepting that change, or applying without decisions, removed it with it. It is now a decision group of its own, suggested `skip`, and goes only when its own removal is accepted.

- **A fork finds the shared elements the project holds by their uuid.** Placing a function onto a project that already holds its category (same uuid, another name) created a second category with that uuid, while the report said it would land on the project's; a category or an allocation role the newer revision dropped was neither listed nor removed, or removed without being listed. Every lookup of a shared element — where a category, an allocation role, a variable or a behaviour description lands, the container a merge pours into, what a fork removes — now reads the scenario's key: the lineage for a template, the uuid for a fork. The report and the apply agree.

- **A fork no longer removes and adds again the references that did not change.** A reference without a uuid of its own (an `LNodeDataRef`, `LNodeInputRef`, `FunctionRef`…) pointing at an element placed from another file was compared through that element's `templateUuid`, which never matches in a fork: every such reference of a signal role was listed as removed and added. It is now compared by the uuid it names, and listed only when it changed.

- **A fork keeps the uuid of every element it places.** A function or an application the newer revision gained, or a first fork into a level that lacked them, was placed as a new instance: a fresh uuid, the file's as its `templateUuid`, a `FunctionSclRef` / `ApplicationSclRef` of its own — and the application's reference repointed to the fresh uuid, so the project no longer matched the file, and the next fork placed a second copy. Every element a fork places now keeps its uuid, with no lineage and no provenance of its own; an SSD fork still lists the file in the project's `Header`. A fork finds an element of the project already carrying the uuid wherever it sits, and reconciles it there instead of placing it again: the report lists it as that element's update, and the apply writes it there.

- **A functional variant reference names its variant by name.** `FunctionalVariantRef@functionalVariant` holds the variant's name, unique among the variants of its Application; scl read and wrote it as the variant's full path. A file naming its variants (`AIS TPO`, `P21/01`) got an `incoherent-reference` warning per reference beside a uuid, and every name was rewritten into a path on import (`S1/CB_App/CB subtype/AIS TPO`); a reference without its uuid did not resolve. The name is now looked up among the variants of the Application holding the reference, in a `FunctionalVariantGroup` or below another variant included, and written as the name: on create from the uuid, on a rename of the variant; a rename of the Application or a group leaves it. On import, a full path an earlier version wrote still resolves and is written again as the name; a reference outside an Application (in a `FunctionRef` of an `AllocationRole`) gets its name from its uuid, a name alone stays unresolved. The pair's resolution is the new `scoped-name` (`RESOLUTION_TYPE.scopedName`), with a `nameScope` naming the ancestor the name is unique in.

- **A signal role path written with the signal's instance and data attribute resolves.** An `LNodeInputRef@sourceRef` (or `LNodeOutputRef@controlRef`) naming the only signal of its name with its instance and data attribute (`…/PDIS1.AmpSv(1).instMag.i`, `…/Trip(1)`), or joining the signal to its LNode with `.` (`SF1/PDIS1.AmpSv`), was not read: without its uuid the reference stayed unresolved, beside its uuid it got an `incoherent-reference` warning. Both forms now resolve, on import and through the query, and are written again in the standard form (`SF1/PDIS1/AmpSv`), as is a signal role path or a `resourceName` in another form next to its uuid. A path an earlier version wrote through LNodes named by their own naming that two signals answer (two LNodes bound to IEDs under the same naming) names neither: it is left unresolved, with an `unresolved-reference` warning, where the first one in the file was taken.

- **A terminal no longer names a substation the schema refuses.** A `Terminal` whose node is in a substation inside a `Process` got that substation's name in `substationName`, which the schema only lets name an element at the root of the document: the file was not valid. It now gets no `substationName` (its process, voltage level, bay and node names are written; its `connectivityNode` still names the substation), and an import removes one written there, with an `incoherent-path-names` warning. A `NeutralPoint` keeps it. The rule is read from the schema's constraints, not declared.

- **On import, the uuid of a reference of the IED section named by attributes wins over its names.** A `ConnectedAP`, `ExtRef`, `FCDA`, `ClientLN`, `GSE` / `SMV`, `IEDName`... whose uuid names another element than its names (an `ExtRef` with `lnUuid` naming `Q0XCBR2` and `lnClass="LLN0"`, a `ConnectedAP` with `apUuid` naming `AP1` and `apName="AP2"`), or whose names name nothing, was kept as read. Its names are now written from the element its uuid names, only those that differ, with an `incoherent-reference` warning, as for the references named by a path. The names are written once for the whole reference, from every uuid it holds or was just given, so an `ExtRef` moved to another logical device by its `lnUuid` keeps naming its control block (`srcLDInst` is then written when it was left to `ldInst`); when no names can name every uuid and keep the other names (an `lnUuid` and a `srcCBUuid` in two IEDs, a control block named without uuid that would move with the logical device), it is left as read, with the warning. A uuid naming an element of another tag (an `apUuid` naming a logical node), a control block of another kind than the `serviceType`, or an element of another IED than the one an `FCDA`, `ServerAt`, `GSE` or `SMV` names by where it sits, is reported and left as read. A uuid naming no element of the file still leaves the reference as read.

- **An `ExtRef` polling its data (`serviceType="Poll"`) no longer names a control block.** A `srcCBName` written beside a `Poll` service got, on import, the `srcCBUuid` of a control block of that name, of any kind; renaming that control block then rewrote it, and `dataflow` listed the `ExtRef` among the subscribers of that control block. It is now left as written, without a uuid, and names no control block; a `srcCBUuid` it holds is reported (`incoherent-reference`) and left as read, as for a control block of another kind than the `serviceType`.

- **The review of an update now lists the type change of a bound LNode that it does not apply.** A template changing the `lnType` of an `LNode` bound to an IED was neither written nor shown by `query.lifecycle.report`, so the type the template specifies was lost without a trace. The report now lists it on the `LNode`'s node, in `keptAttributeChanges` (`{ name: 'lnType', before, after, reason: 'bound-logical-node' }`); the `LNode` still keeps its type, it opens no decision and does not make the instance out of date. `report.summary.kept` counts these changes, so an instance that is up to date can still be shown to carry some. Its implementation (`iedName`, `ldInst`, `prefix`, `lnClass`, `lnInst`, `lnUuid`) is still not listed. The types `KeptAttributeChange` and `KeptAttributeReason` are exported.

- **An `LNode` bound by `lnUuid` follows the renames of the logical node implementing it.** Renaming that logical node (`prefix`, `inst`), its logical device or its IED left the `LNode` naming the former `iedName` / `ldInst` / `prefix` / `lnClass` / `lnInst`, and the addresses of its signals were then written in the wrong form: a `SourceRef` whose `ExtRef` sits in the mapped logical node went from `Trip` to `LD1/XCBR1.Trip` or `P9/LD0/XCBR1.Trip`. The `LNode`'s naming now follows in the same transaction (its `LNodeSpecNaming` is unchanged) and the addresses of its signals are written again from it, the bare `intAddr` kept. `applyUuidRemap` repoints an `LNode` cloned with its logical node onto the copy and writes the copy's names; one cloned without it keeps its `lnUuid`. Creating or importing an `LNode` still leaves its `lnUuid` and its names as written (its binding writes them): an `LNode` bound by its names only gets no `lnUuid` on import, and one whose `lnUuid` and names disagree is reported with an `incoherent-reference` warning, not rewritten. `TUPLE_REFERENCE_PAIRS` lists `LNode` (`lnUuid`) with the new `followsOnly` flag of `TupleReferencePair`.

## [0.10.0] - 2026-10-19

### Added

- **`readAttribute` and `readAttributes` read an SCL record you hold without passing the configuration.** Exported from `@dialecte/scl/v2019C1`, they read it as `query.getAttribute(s)` does (same `namespace`, `defaults` and `fullObject` options, same results), synchronously, for an import pass or a pure function.
- **The `dataflow` extension tells what each signal describes and what implements it, and links them.** `query.dataflow.ofSourceRef` and `ofControlRef` give the dataflow of one signal, `all` every dataflow of the document, templates included, and `ofIed`, `crossing` and `subscribersOf` read them by IED (what it `subscribed` to and `published`), across a set of IEDs, and by control block. A `SpecifiedDataflow` tells the `direction`, the `specification` (`open` or `connected`, the `service`, the `holder` and `other` LNodes with the data named: the data object and the data attribute are split from a path against the data model of the LNode's logical node type, a sub data object and a nested data attribute included (`PhV.phsA` and `cVal.mag.f`), never cut at the first dot, and the path as written is kept in `dataPath`; nothing is guessed when the data model cannot be followed, the `allocation` `same-ied`, `inter-ied` or `unallocated` from the IEDs they are mapped into) and the `implementation` (`implemented` once the signal names its `ExtRef` / `ExtCtrl` by uuid or by address in any written form, with that `element`, its `binding`, its logical node and IED, the `controlBlock` it names and its `publisher`, the subscriber's `registration` and its precision, and the `dangling` uuids and addresses naming nothing). An `ExtRef` naming a control block that no signal links to is an `implementation-only` entry. `tx.dataflow.link` names the element implementing a signal by its uuid and writes its address, `tx.dataflow.unlink` removes both, and `link` refuses with `DATAFLOW_LINK_TARGET_MISMATCH` an element of a kind the signal cannot be implemented by. The types `Dataflow`, `SpecifiedDataflow`, `ImplementationOnlyDataflow`, `Registration`, `DanglingLink`, `IedDataflows`, `ControlBlockSubscribers`, `LinkParams`, `UnlinkParams` and the error meta types `LinkedElement` and `LinkTargetMismatchMeta` are exported.
- **An `ExtRef` and an `ExtCtrl` now have a `state` in `info.of`** (and `info.ofEach`), read from the shape they are written in: `later-binding` (the internal address `intAddr` and, for an `ExtRef`, the expected data object `pDO`, nothing of a signal, a service or a control block), `expected` (the signal is named, no `intAddr`, no control block), `subscribed` (the signal, the service and the control block, when it needs one, are named; no `intAddr`) and `bound` (also the `intAddr`). An `ExtCtrl` is `later-binding` (its `pDO` optional) or `bound` only. An element written in none of these shapes - nothing written, an `ExtRef` `intAddr` without a `pDO`, a signal named in part, a control block named without a signal, an `intAddr` beside a signal without its service or control block - has no state (`undefined`). The types `ExtRefState` and `ExtCtrlState` are exported, and `ElementStateByTag` gains both tags.
- **Renaming an IED, an access point, a logical device, a logical node or a control block updates the references naming it by attributes.** The `ConnectedAP`, `ExtRef`, `FCDA`, `GSE` / `SMV`, `ClientLN`, `IEDName`... pointing at it (or at an element below it) by uuid write its new names in the same transaction, only those that differ: a name its target leaves out (no prefix) is removed, a part left to its schema value or to another of its attributes (`srcLDInst` left to `ldInst`) stays left out, `iedName="@"` stays. Renaming a `DataSet` updates the `datSet` of the control blocks publishing it.
- **`applyUuidRemap` repoints the cloned references named by attributes** onto the clone of what they name (or the element a redirect maps it onto), as it does for the other references, and writes that element's names (`iedName="@"` replaced by the IED's name when that element is in another IED).
- **Importing a file fills the uuid of the IED-section references that name their target by attributes.** A `ConnectedAP` or `KDC` without `apUuid`, an `ExtRef` without `lnUuid` or `srcCBUuid`, an `FCDA`, `ClientLN`, `Association` or `ExtCtrl` without `lnUuid`, a `GSE` or `SMV` without `cbUuid`, an `IEDName` without the uuid of what it names, a `ServerAt` without `apUuid`: each gets the uuid of the access point, logical device, logical node or control block its names name in the file (`iedName="@"` naming the IED the reference sits in, an `ExtRef`'s `serviceType` telling control blocks of the same name apart). A name naming nothing in the file, or several elements it cannot tell apart, is left as written. `TUPLE_REFERENCE_PAIRS` lists these references and the attributes naming their target (types `TupleReferencePair`, `TupleRoles`, `TupleRole`, `IedRole`).

### Changed

- **An LNode assigned to no IED keeps the logical device it is specified in.** Unlocking it (`dataModel.unlockLNode`), clearing its `lnUuid`, or releasing a binding to a logical node the document lacks now takes `ldInst` back from its `LNodeSpecNaming` (`sLdInst`), like its prefix, class and instance; it was removed. Without an `sLdInst`, `ldInst` is still removed.
- **The written form of `extRefAddr` and `extCtrlAddr` follows where the `ExtRef` / `ExtCtrl` sits relative to the signal's LNode.** The internal address alone when it sits in the logical node the LNode is mapped to (`Trip`), `LD/LN.intAddr` in another logical node of the same IED (`LD0/GGIO1.Trip`), the full path otherwise (an LNode mapped to no IED or to another one, or a logical node held directly by an access point); none when the element has no `intAddr`. The logical node the LNode is mapped to is read from its naming attributes (`iedName`, `ldInst`, `prefix`, `lnClass`, `lnInst`), which setting its `lnUuid` writes. The address follows the renames of the element's own logical device and IED and the mapping changes of the LNode (mapping, remapping or unmapping it rewrites the addresses of its signals, and removes one that can no longer be written); an LNode bound by `lnUuid` does not yet have them follow a rename of the logical device or IED of its logical node, so after such a rename the address is written in the `LD/LN.intAddr` or the full form. The import writes the new form for a missing, former or disagreeing address and keeps an agreeing one as written.
- **A reference whose path is removed or edited while its uuid still names an element gets the path written again from that element.** The uuid wins, as it already does when the uuid or the companion data names (`sourceDoName`...) change; a `SourceRef` whose `extRefAddr` is removed gets it back in the written form above, unless its `ExtRef` has no `intAddr`.
- Requires `@dialecte/core` 0.6.4: reading a record the queries and hooks already hold costs no store round trip, so describing the dataflows of a document and following a rename read the store less; and the readers of the IED section, the process section and the data model read their elements by tag name instead of reading the whole document, several times faster on a document whose data instances far outnumber its IEDs (`Private`, `Text` and `Val` elements are still read in the whole document); and a record already held, in an import pass or a hook, is read the same way as through a query, without one.

### Fixed

- **Importing a reference that names an LNode's data by path now writes the data names beside the LNode uuid.** A `SourceRef`, `ControlRef`, `ProcessEcho`, `LNodeDataRef` or `InputVar` / `OutputVar` naming its LNode by path only (`source="S1/F1/PTRC1.PhV.phsA.cVal.mag.f"`) got the uuid but not the data names a data reference by uuid carries (`sourceDoName`, `sourceDaName`, `controlledDoName`, `doName`, `daName`). The import now writes them, split against the data model of the LNode's logical node type. When the data object cannot be written (no `lnType`, a type or a name the file lacks, a path with no data) the reference is left as read, without the uuid, and the import reports a `data-path-not-split` warning (`DataPathNotSplitWarning`).
- **A tuple reference created with a uuid carries the names of its target, and a target created with a uuid gives its names to the references naming it.** An `ExtRef` created with `srcCBUuid` or `lnUuid` only, an `IEDName` created with `apUuid` only, and every other reference named by attributes (`ConnectedAP`, `ClientLN`, `FCDA`, `GSE` / `SMV`, `ExtCtrl`...) now get the names of what their uuid names in the same transaction, and creating an access point, a logical device, a logical node or a control block writes its names on the references already naming its uuid.
- **Updating a template no longer unbinds the project's bound LNodes.** An `LNode` bound to an IED by its `lnUuid` lost it on every template update (a template carries none), and was then assigned to no IED, sometimes keeping the device's prefix and instance. A bound `LNode` now keeps where it is implemented (`iedName`, `ldInst`, `prefix`, `lnClass`, `lnInst`, `lnUuid`) and its `lnType` through every update, a `fork` included; what the template specifies for it is written to its `LNodeSpecNaming`.
- **The review of an update no longer announces changes to a bound LNode's implementation.** `query.lifecycle.report` listed every difference between the template and the bound `LNode` (`iedName` to `None`, `lnInst`, `lnUuid` removed...), most of which apply did not write. They are no longer compared; a specification change shows on the `LNodeSpecNaming`.
- **Instantiating or updating a template no longer leaves LNodes bound to a device the project does not hold.** A template's `LNode` bound to its own IED kept that binding once placed, naming a logical node absent from the project, and stayed locked against every later update. `tx.lifecycle.apply` now looks at the implementation it wrote (the `LNode`s, data and signals it created, a level it created included, and those whose binding or reference it changed): an `LNode` bound to a logical node the project lacks is assigned to no IED, its naming back from `LNodeSpecNaming`, and a `DOS` / `SDS` / `DAS` or `SourceRef` / `ControlRef` naming a logical node, `ExtRef` or `ExtCtrl` the project lacks loses that name. A `fork` whose project holds the logical node keeps the binding; what the run did not write is not touched. An added `LNode` written `iedName="none"` (lowercase, not the unallocated marker) comes out `iedName="None"`.
- **`cleanUp.resetLNode` judges a binding by its logical node, not by an IED of that name**, and leaves `LNodeSpecNaming` as specified. An `LNode` bound to an IED that exists but does not hold its logical node is now released; with an `lnUuid`, only the logical node of that uuid counts. `sIedName` and `sLdInst` are no longer rewritten (`sIedName="None"` before). It also removes the `DOS` / `SDS` / `DAS` and `SourceRef` / `ControlRef` names that point at nothing, and takes `{ elements }` to look at some elements only. The extract clean-up uses it.

## [0.9.0] - 2026-10-15

### Added

- **A terminal follows its connectivity node.** A `Terminal` or a `NeutralPoint` names its `ConnectivityNode` by `cNodeUuid`, by its path (`connectivityNode`) and by the names of the levels holding it (`processName`, `lineName`, `substationName`, `voltageLevelName`, `bayName`, `cNodeName`). Creating one with its uuid writes the path and the names; renaming the node or a level above it rewrites them, and the node's own `pathName`; pointing it at another node rewrites them from that node; deleting the node deletes the terminals connected to it, the equipment stays. Extracting, instantiating and updating a bay-typical keep every terminal naming the nodes of its own copy. `DERIVED_REFERENCE_ATTRIBUTES` lists the attributes written from a path, `REF_ENTRIES_BY_TARGET` the references that can name each element. `buildReferencePath` takes the target's path when the caller already read it.
- The import makes a terminal's path, uuid and level names agree, and a connectivity node's `pathName` its position: a value that disagrees is written again, with an `incoherent-path-names` warning (`IncoherentPathNamesWarning`). A terminal naming the predefined `grounded` node, which a file need not declare, is kept without a warning.
- The types of an element's state are exported: `ElementState`, `ElementStateByTag`, `SignalState`, `LNodeState`, `LNodeMapping` - the `state` of `info.of`. So is `DerivedSpecificationNamingWarning`, the member of `SclImportWarning` for an LNode given a derived `LNodeSpecNaming` on import.

### Changed

- **On import, the uuid of a reference wins over its path.** A reference whose path names another element than its uuid, or none, was kept as read: its path is now written from the element the uuid names, with an `incoherent-reference` warning. A uuid naming no element of the file still leaves the reference as read.

### Fixed

- Updating a project from a newer SSD no longer copies the template's paths into it: a terminal's `connectivityNode` and level names and a connectivity node's `pathName` named the `TEMPLATE` scaffolding after the update, and showed as changes in its report.

## [0.8.1] - 2026-10-15

### Fixed

- **Extracting or instantiating keeps the attributes of a namespace the dialecte does not declare.** A Substation, VoltageLevel or Bay carrying one (a diagram editor's `esld:x`, `esld:h`) made `lifecycle.extract.ssd` and the instantiation of a template fail with `UNKNOWN_NAMESPACE_PREFIX`: the structural levels were copied through their value object, where such an attribute has no namespace. They are copied with their own entries now, each attribute in its namespace.

## [0.8.0] - 2026-10-14

### Changed

- **Breaking (types): an element that may take another type with `xsi:type` is a union on `'xsi:type'`**, one named member per type (`AttributesConfLdName_tSCSM`, ...; `_Own` for the element's own attributes). An attribute only one type declares is typed on that member again: write it with the type, `addChild(services, { tagName: 'ConfLdName', attributes: { 'xsi:type': 'tSCSM', iec61850_8_1 } })`. A filter may leave the type out and match across types, or name it to narrow: `{ 'xsi:type': 'tCommProt', iec61850_8_1 }` is refused. Generated with `@dialecte/create` 0.1; a test checks the config's namespaces agree with the definition.
- Requires `@dialecte/core` 0.6.1: `assertValidSclXml`, `runSclTestCases` and `createSclTestProject` check the attributes of every namespace and allow what an element's attribute wildcard allows - a fixture carrying an attribute its element does not declare now fails.

## [0.7.0] - 2026-10-14

### Changed

- **Breaking - built on `@dialecte/core` 0.6 and the definition `@dialecte/create` writes from 0.1 on.** `DEFINITION` has the new shape: a tag declared several ways lists its declarations, a value's facets sit in its datatype, identity constraints sit on the declaration that declares them, and `TYPES` holds the types an element may take with `xsi:type`. Code that reads `DEFINITION` directly must follow; code that goes through `query.getDefinition` gets the declaration that applies. `SCL_DIALECTE_CONFIG` carries `types`.
- **A name made unique follows the uniqueness rules as the schema writes them.** A rule that reaches the whole document (`.//`, such as the uuid uniqueness on `SCL`) is left to validation: a placement does not rename for it. A rule that selects elements of another namespace than the children it is meant for selects nothing. The `LNode` rules of a `SubFunctionTemplate` name SCL `LNode`s, while a template holds 6-100 ones, so the logical nodes of a template are no longer renumbered.
- **Breaking:** an element's attribute type (`AttributesOf`, `Scl.AttributesOf`) lists its declaration's attributes only. Attributes that only a type named with `xsi:type` declares are no longer listed (for example on the services capability elements). `xsi:type` stays an optional key, its hints the types the element may name, only where the element may name one (a `P` under an `Address`, not under a `PhysConn`). For a tag declared several ways, the by-tag type hints the values any of its declarations accepts.

### Fixed

- **A name made unique follows the rules of the place it sits.** One tag can carry different uniqueness rules under different parents (an equipment of a sub-function compares the names of its sub-equipments only, an equipment of a bay those of its sub-equipments and functions together). The rules of one declaration were applied everywhere, so a name could be renumbered where it was free, or reported under the wrong rule.
- A mapped data name (`mappedDoName`, `mappedDaName`) is checked against every pattern level its schema type declares, read as the schema writes it (Unicode categories included).
- The logical node classes a reference path accepts are those the schema enumerates, across its union of class lists.
- A decision group's `editableAttributes` are those the element's definition declares where it sits, including the type it names with `xsi:type`. They used to be its tag's declared attributes only.
- **A reference given several uuids at once gets every path.** A `SourceRef` or `ControlRef` created with both its source (controlled) LNode and its process resource, or pointed at both in one update, kept only the last path written (`resourceName`): its `source` (`controlled`) path was lost.

## [0.6.0] - 2026-10-14

### Added

- **The state of an element, next to its title.** `info.of(ref).state`: a SourceRef / ControlRef is `{ binding: 'open' | 'connected', implemented }`, connected once its source (controlled data) is given by path or by uuid, implemented once the ExtRef / ExtCtrl is named, whether connected or not; an LNode is `{ locked }`, locked once an IED is assigned (`iedName` set and not `None`). An LNode also carries `mapping`: `unmapped`, `specification-ied` or `real-ied`, from the LN it is bound to (by `lnUuid`, else by its identity attributes) and the kind of the IED holding it. Other tags have no state. Types `ElementState`, `SignalState`, `LNodeState`, `LNodeMapping`, `ElementStateByTag`.
- **Every LNode carries its `LNodeSpecNaming`.** The naming an LNode was specified with is kept in its `LNodeSpecNaming`, so binding it to an IED no longer loses it. An LNode a transaction creates keeps the one a copy or the caller gives it, otherwise gets one from its own naming when the transaction's work is done (the IED and LD names left out once an IED is assigned); setting `lnUuid` on an LNode without one gives it one first; on import an LNode without one gets one, and the import reports a new `derived-specification-naming` warning when that LNode is already bound to an IED. Type `DerivedSpecificationNamingWarning`. Needs `@dialecte/core` 0.5.4 (`beforeCommit` hook).
- **`dataModel.unlockLNode({ lnode })` unlocks an LNode bound to an (S-)IED.** The `DOI` / `SDI` / `DAI` instantiating the data its `DOS` / `SDS` / `DAS` specify are removed from the LN that implements it, its `SourceRef` / `ControlRef` are no longer implemented, and it is assigned to no IED: `iedName="None"`, `ldInst` and `lnUuid` cleared, `prefix` / `lnClass` / `lnInst` taken from its `LNodeSpecNaming`, which stays. An LNode assigned to no IED is left as it is.
- **`query.lifecycle.classifyIeds()`** tells, for every IED in document order, whether it is a real device's IED or a specification IED: implemented when an ICD or IID file is among its own source files, or when the document is an `.icd` file; any other IED is a specification IED, whatever its manufacturer or name. Types `IedClassification`, `IedKind`, `IedClassificationBasis`.
- **Choose where a shared element lands.** `lifecycle.report` returns `mappings`: for each element a placement brings that the project may already hold — an `AllocationRole`, a `FunctionCategory` (a `SubCategory` lands on the project's sub-category of the same name), a `Variable` or `BehaviorDescription` (listed with `selectable: false`: shown, not chosen) — where it lands (an element of the project, or a new one), why, and every project element it could land on instead. Pass a choice in `resolution.mappings` — `{ existing: ref }` or `{ create: { name? } }` — to `report` to see its consequence in the report and the review tree, then to `apply` to carry it out. A choice the report cannot honour is refused. Works for a function, an application placed directly, the applications an SSD carries, and the SSD itself. New types: `ReportMapping`, `DecisionMapping`, `MappingCandidate`, `DecisionMappings`, `LifecycleReportParams`.
- **Where the levels of an SSD land is a mapping.** On `instantiate`, each structural level of the template (`Substation`, `VoltageLevel`, `Bay`) is listed first in `mappings`, top-down, each with `dependsOn` (the level above) and, as `candidates`, the elements of the project below the one the level above lands on. A level above the unit lands on the level of the element the consumer started from (`reason: 'anchor'`), else on the only such level there is (`reason: 'only'`); with none it is created, named after its kind; with several, none is picked: the mapping is listed without a `mapping` (`ambiguous`), every level below it waits, `needsDecisions` is `true` and `apply` refuses until the consumer chose one or asked for a new one. The consumer can map any level onto a candidate or name the new one; `apply` places the content accordingly, whatever element it was started from. A level mapped onto an element of the project receives the content that element lacks; what it holds is left as it is, it is not renamed and gets no lineage. The shared elements of the template are looked for from where it lands, not from the element the consumer started from. A value edited in the review has the last word on the name of the placed unit. On the report `apply` returns, each mapping carries `appliedRef`: the element it is mapped onto, or the one created for it. `MappingReason` gains `'anchor'` and `'only'`; `ReportMapping` gains `dependsOn` and `appliedRef`, and its `mapping` becomes optional.
- **A function or an application lands on the level its template was made for.** The level a function sits at in an FSD is the highest level it may be placed at; an application and the functions it composes each have theirs in an ASD. Started at that level or below, the template lands where the consumer started. Started above it (a function made for a bay, started from a voltage level), `lifecycle.report` lists the levels of the template in `mappings`, resolved like those of an SSD, and `apply` places each primary on the level its template says, creating the levels the project lacks. The report then carries `offLevel` (`templateLevel`, `startedFrom`) so the consumer can tell the user the content lands below where they started.
- **An FSD whose function is a `FunctionTemplate` can be instantiated and updated.** `lifecycle.report` / `lifecycle.apply` with `verb: 'fsd'` accept a `FunctionTemplate` as `ref` (`FsdFunctionRef`). Such a template has no parent level: it is placed where the consumer starts from, whichever level that is, as a `Function` — a `SubFunction` under a function — and each `SubFunctionTemplate` as a `SubFunction`. Everything inside it moves to the namespace the schema declares where it now sits. The report speaks of what the project will hold, the instance carries the template's lineage, and an update finds it and reconciles it like any function.
- **An update keeps the mappings an instantiate made.** For each instance, `report` and `apply` find the project element it already holds for a shared source element — from the element's lineage (proposed first, whatever it is named now), from the references the mapping gave it, from its name, or because it is the only one — and keep it: the mapping is listed with `reason: 'lineage'` and `locked: true`, and a choice for it is refused. On an SSD update, each instance lists the levels it already sits on the same way: a level created from the unit is found by its lineage, a level of the project the unit was mapped onto as the one holding what the placement put there. A project element a mapping points at only receives what the template contributes; its own attributes and children are left alone and it is never deleted. A shared element the instance holds nothing for is resolved as on a first placement and can be chosen; one that cannot be told apart is listed with `ambiguous: true` instead of being guessed. A choice made for one of those settles the others. An update asked on a project that holds no instance yet is a first placement. `ReportMapping` gains a required `locked` field and `MappingReason` gains `'lineage'`.
- **A shared element the template drops takes back what the instance gave.** The project element it was mapped onto stays, with its own attributes and children; the references the instance had contributed to it are announced as removed and removed when accepted.
- **A level the template gains is a choice, per instance.** On an update, a level the template gained since an instance was placed (a bay added to a voltage level typical) is listed in `mappings` for that instance: created by default under a free name, or mapped onto a level of that kind the project already holds there (its content lands in it, the project level keeps what it is), or named.
- **The report says where a mapping lands and whose element it is.** `ReportMapping.kind` tells a structural level of the template (`'level'`) from a shared element (`'shared'`). `projectOwned: true` marks a mapping that lands on an element the project owns — reused, not an instance of the template's element. A mapping to create carries `parentPath`, the path of the element it is created under. A mapping decided for one element of the project (the function an instance of an application stands on) says which (`placedFor`), and the source element (`sourceId`) when its `id` is scoped to it.
- **What the template gains is decided per instance.** A function or an application the template gains is placed for each instance of the template (a function an application gained, in the bay of each instance of the application; a primary a substation template gained, in each instance of the unit), and the report lists it the same way: one first-time instance per placement, with `ReportInstance.placedFor` — the instance it is placed for, the same before and after the write — and its own groups, so leaving it out for one instance no longer leaves it out for all.
- **`DiffReport.templateInstances`** — the instances of the template itself that a report covers (the applications of an ASD, the functions of an FSD, the placed units of an SSD), without the functions an application composes or the primaries a unit holds, which `instances` also lists. Empty on a first placement.
- **The consumer's own step after the apply** (`resolution.afterApply`). A function the consumer passes with what it resolved runs once, after the whole apply, in the same transaction — so a preview shows what it writes and a consumer applying without a review gets it too. It receives the instances the apply placed or reconciled. An application or function it renames is made unique again where it sits afterwards. Type `AfterApplyHook`.
- **`getPathSegment(record)`** is exported: the segment a reference path gives an element, or `null` when a path cannot address it — read from the record alone, without a query (cheaper than `buildElementPath` when only that question matters).
- **`tx.lifecycle.makeUnique({ ref })`** makes an element unique where it sits, in the engine's numbering, and says what it did (`ok`, `resolved` with `attr` / `from` / `to`, or `unresolvable`). Types `MakeUniqueParams`, `PlacementResolution`, `ConstraintViolation` exported.
- **Every error and warning has a code, a default wording and its data.** The dialecte declares its own errors (`SCL_ERRORS`: `MAPPING_CHOICE_UNKNOWN`, `MAPPING_CHOICE_NOT_SELECTABLE`, `MAPPING_CHOICE_LOCKED`, `MAPPING_CHOICE_NOT_A_CANDIDATE`, `MAPPING_UNDECIDED`, `DECISION_DEPENDENCY_SKIPPED`, `TEMPLATE_ROOT_NOT_FOUND`, `TARGET_HEADER_MISSING`), raised as structured errors with `meta` — the source element, its tag, the element chosen. Read one with `toDialecteError`, narrow its `key` with `isKnownDialecteError(error, { catalogues: [SCL_ERRORS] })` and word it yourself from its `key` and `meta`; `message` is the fallback. The import warnings have their default wording in `SCL_IMPORT_WARNINGS`, and their types are exported (`SclImportWarning`). No error of the lifecycle is a plain `Error` any more. Requires `@dialecte/core` 0.5.3.
- **Test fixtures are checked for coherent references.** `runSclTestCases` and `createSclTestProject` now also verify, for every reference carrying a uuid, that the uuid is carried by an element of the same document that the reference can point at and, for plain name-path references, that the written path is the path of that element. A fixture that could not occur in a real file fails up front, with the path to write, instead of exercising reference handling on impossible data; this applies to every consumer of `@dialecte/scl/v2019C1/test`. A case that needs an incoherent reference says why with `allowIncoherentReferences: '<reason>'` and is left unchecked. `assertCoherentSclReferences` is exported for ad-hoc use.

### Changed

- **`presentation` is now `info`, one call for what an element shows.** `doc.query.info.of(ref, { mode?, withLabels? })` returns `{ title, state?, labels? }`, `ofEach(refs, options)` the same for several elements in their order. `extractElementTitle` is removed: `extractElementTitle(ref)` becomes `(await info.of(ref)).title`, and `withLabels: true` puts `labels` on the same object. Types `ElementInfo`, `InfoOptions`; `ElementTitle`, `ExtractElementTitleOptions`, `ExtractElementTitleOptionsWithLabels` removed.
- **A SourceRef or ControlRef is titled by its name.** Compact: its name among the signals of its LNode (`Trip`, `Trip(1).general`, `Oper(2)`), without the service; whether it is connected is its state. Full: `name/pLN.pDO.pDA/source` (`name/pLN.pDO/controlled`).
- **A SourceRef or ControlRef is named among the signals of its LNode.** Inside a path (`InputVar.inputName`, `OutputVar.outputName`, a path through a signal), a SourceRef is its plain `input` while no other SourceRef of its LNode shares it, and `input(inputInst).pDA` once one does (the instance written even when it is `1`; ControlRef: `output(outputInst)`). The engine used to decide from the values alone: `Trip.general` for the only `Trip`, `Trip(2)` for the only one of instance 2, `Trip` for instance 1 of two. Adding, renaming or removing a SourceRef renames the references to the ones sharing its input. Breaking for stored names: on import the former names still resolve and are written again in the standard form.
- **`resourceName` holds the bare name of the ProcessResource.** On SourceRef, ControlRef, SubscriberLNode and ControllingLNode it is the ProcessResource's name, looked up in the element's ancestors, nearest first, instead of its full path: renaming a Function or a Bay no longer touches it, and a homonym higher up is not reached while a nearer one exists. Breaking for stored values: on import a full path still resolves and is written again as the name.
- **An LNode is named in paths by its specified naming.** Once an IED is assigned to an LNode, a path through it (`source`, `controlled`, a path to one of its signals or data, ...) names it by its `LNodeSpecNaming` (`S1/F1/XCBR1.Pos`), no longer by the IED's naming binding wrote on it (`S1/F1/Q0XCBR2.Pos`): binding and unbinding leave the paths as they are. While no IED is assigned, it is still named by its own attributes, and an edit of them is written to its `LNodeSpecNaming` too. Editing, adding or removing an `LNodeSpecNaming` rebuilds the paths through its LNode. Breaking for stored paths: on import a path with the IED's naming still resolves and is written again as specified; a path in a former form (LNode or signal name) next to its uuid is written again too. `getPathSegment(record, { siblings, specNaming })` and `parseReferencePath({ resolution, pathAttribute, pathValue, ancestry, specNamings })` take an object; `buildPathFromAncestry` takes `specNamings`.
- **A signal role names its signals from their Function.** `LNodeInputRef.sourceRef`, `LNodeOutputRef.controlRef` and `LNodeDataRef.data` are the path from the target's Function down, that Function left out: `PTRC1/Trip`, `SF1/XCBR1/Oper` (every level joined with `/`), `SF1/XCBR1.Pos.stVal`. They were written from the root (`S1/F1/PTRC1.Trip`). Renaming the Function no longer touches them. Breaking for stored paths: on import an absolute path still resolves and is written again relative, also next to its uuid. `parseReferencePath` takes a `functionBase` for these pairs.
- **The report says what is asked for, not the names that will be written.** A mapping to create carries the name asked for — the consumer's, else the template's — instead of the free name the engine predicted. `apply` still makes every name free where it lands, and the consumer's own step may rename after that: read the names written at the elements the report leads to once applied or previewed (a node's or a mapping's `appliedRef`).
- **A taken name that already ends with a number gets the next number, not a second one** (`Prot_1` taken → `Prot_2`, was `Prot_1_1`). One format everywhere the engine makes a value free.
- **Several project elements qualify for a role or a category: none is picked, and none is created either.** The engine used to pick the first one (or create a new one under a free name flagged `ambiguous`); a duplicate was then one click away, and an update applied as it was dropped the instance's references to the role it held. The mapping is now left undecided: `mapping` is absent, the report sets `needsDecisions`, and `apply` — and `instantiate.asd` / `instantiate.fsd` / `update.asd` / `update.fsd` — refuse until the consumer passes a choice (`{ existing }` or `{ create: {} }`). Breaking for a caller that relied on the automatic pick or creation. Variables and behaviour descriptions, whose mapping cannot be chosen, are created under a free name.
- **A report lists the candidates of a kind of shared element once** per instance instead of once per element. Measured on a project with 500 allocation roles and a template bringing 5: 2.5 s down to 0.6 s per report.
- **The identity warnings say what the engine does.** The `fallback` texts of `cross-type-template-uuid`, `template-uuid-type-mismatch` and `duplicate-instance-uuid` no longer claim the element is matched by its name.
- **Clone mappings are named `cloneMappings` everywhere; `recordMappings` is gone.** `transplant.deep`, `instantiate.fsd`, `instantiate.asd` and `instantiate.ssd` each return a single `cloneMappings`: every source record the operation cloned and the copy made of it (on `instantiate.ssd`, including the variables and behaviour descriptions carried with the scope). The `mappings` parameter of `identity.transaction.writeIdentity`, `identity.transaction.restoreClonedUuids` and `reference.transaction.applyUuidRemap` is now `cloneMappings`. Breaking for callers: read `cloneMappings` instead of `recordMappings`, and rename the key. The engine tells four kinds apart by name — `cloneMappings` (a source record and its copy), the `mappings` of a report and of a `resolution` (where a shared element lands, as resolved and as chosen) and `redirectMappings` (references repointed to an existing element). `applyUuidRemap` also takes `redirectMappings` and repoints the references to them like the cloned ones.
- **`lifecycle.apply` takes what the consumer resolved as one `resolution` object, and `lifecycle.report` takes the same one (optional).** `decisions` and `keepNameTypesFrom` move from the top level of the parameters into `resolution: { decisions?, keepNameTypesFrom? }`. Breaking for callers: `apply(tx, { ...target, report, decisions })` becomes `apply(tx, { ...target, report, resolution: { decisions } })`. Every `DiffReport` and `ReportInstance` carries `mappings`. The `Resolution` type is exported.
- `lifecycle.transplant` `mergeChildrenInto` returns `{ cloneMappings, redirectMappings }` (was the clone mappings alone), and finds the twin of a source container by its lineage before its name.

### Removed

- `DecisionGroup.conflict` and the `GroupConflict` type. The report set them for a placement collision whose key fields are all identity and documented a "skip or adopt" decision, but `apply` never read the field and no placed element can reach that case: every group primary is keyed by its name.
- `EditableAttribute.conflict` and `suggestedValue`: the report no longer predicts the name a placed element is written under (see Changed); read it at the group primary's `appliedRef` once applied or previewed.

### Fixed

- **An ExtRef address given as its `intAddr` alone resolves.** `extRefAddr` / `extCtrlAddr` holding only the `intAddr` (`TrCmd.stVal`, or `@TrCmd.stVal`), the form for an `ExtRef` in the LN implementing the LNode, now resolves in that LN on import and through `resolveReferencePath`, like the full path and the path inside the IED did. The value is kept as written.

- **A name with a qualifier resolves.** `inputName="Trip.general"`, `"Trip(2)"` or the name of an input holding a dot (`PTOC1.Op`) did not resolve on import nor through `resolveReferencePath` / `resolveElementPath`: the name was cut at its first `(` or `.`. It is now compared whole with the names built for the candidates, including from a BehaviorDescription of the Function (`PTRC1.Trip`).
- **A reference written with its uuid only now gets its path.** Creating a reference with only its uuid attribute (`functionUuid`, `sourceLNodeUuid`, ...) left the path attribute (`function`, `source`, ...) out, and a later rename of the target did not add it: a tool reading the paths saw no target. The path is now written on create, on the next rename of the target, and on import for a file that carries the uuid only (a uuid naming no element of the file leaves the reference as it is). A `SourceRef`, `ControlRef` or `ProcessEcho` path names the data of its companions (`S1/F1/XCBR1.Pos.stVal`).
- **`InputVar` / `OutputVar` paths are local to their behaviour description.** `dataName` named the logical node (`XCBR1`) instead of the data (`Pos.stVal`), so a rename of that logical node overwrote a correct `dataName`. `dataName`, `inputName` and `outputName` are now the path from the parent of the `BehaviorDescription` down to the target: `Pos.stVal` and `Trip` when it sits in the logical node, `XCBR1.Pos.stVal` and `XCBR1.Trip` when it sits in the function.
- **A first placement honours every leave-out.** Leaving out a level of an SSD (a bay), a function or an application on a first placement was ignored: `apply` wrote the whole template, so a preview with the consumer's decisions announced what the consumer had left out. Every leave-out is now honoured, and the report says what goes with what (`dependsOn`): a group placing an element inside a level another group adds depends on it — a level takes what it holds with it — and a group adding a reference to an element another group places depends on that group (the application on the functions it composes, the reference to a function placed for an instance on that placement). Leaving out a level while keeping what it holds is refused (`DECISION_DEPENDENCY_SKIPPED`); everything left out writes nothing, not even the provenance. An application left out alone: the functions it composes are placed without it, with no provenance of their own. The same rule holds on an update for what the template gained, and a level an update adds no longer brings the functions and applications it holds: they are placed by their own pass, each by its own decision.
- **What an update does for a function an application gained is what the report said.** Where an instance of the application lives, a function of that lineage standing on its own was taken for it by `apply` while the report listed it once, for all instances. The report now lists, per instance, the function taken or the one placed — the same answer `apply` acts on. When several such functions qualify for one instance, the choice is listed in `mappings` for that instance (`placedFor`, `sourceId`, an `id` scoped to the instance), the report asks for a decision and `apply` refuses until it is made — before, the instance gained a reference to nothing.
- **The report tells what the last apply placed.** One report applied more than once (a preview with everything accepted, then a dry run with the decisions, then the commit) kept the `appliedRef` an earlier run gave an element the last run left out. Each apply now forgets the earlier runs first. On a first-time SSD apply, the variables and behaviour descriptions it carried are correlated too.
- **An FSD placed inside a function is found again on update.** Placed under a function, the template's function is a subfunction; `report` and `apply` now look for what the placement wrote (`SubFunction` under a function or a subfunction, else `Function`) and reconcile it instead of placing a second one.
- **A shared element the template drops is removed even when nothing else changed.** A role, category, variable or behaviour description the placement created and the template no longer has was announced as removed only alongside a change of the element it belongs to. Its removal is now a decision of its own.
- **An application or function update reaches every instance, each where it lives.** With several instances of one application (or an application of a bay typical placed in several bays, or a primary a substation template gained): a function the template gained was placed once, under the element the update was started from, and every instance pointed at it — each instance now gets its own, in the bay of its other functions, and points at it (a function of that lineage standing there on its own is taken instead). The functions of the instances outside the element the update was started from are now reconciled where they sit.
- **A function or an application placed as part of a larger template carries that template's provenance.** A function an application gained, and a primary a substation template gained, were given their own `FunctionSclRef` / `ApplicationSclRef` on update; they now carry none, as on a first placement.
- **An element several instances share gains one reference per instance.** When the template's `AllocationRole`, `FunctionCategory` or `Variable` gained a reference, the first instance updated contributed its own and the next ones found it "already there". `report` and `apply` now compare each instance with its own references only.
- **A function or an application the template gained lands in the right level.** An FSD or an ASD started above the level its function was made for no longer leaves the function there: it is placed in a bay. On an SSD update, it lands in each instance's own level — the bay each instance lives in, the one created from the typical or the one of the project it was mapped onto — instead of once beside the bays.
- **An SSD placed from an element above the level it needs no longer creates a level named `TEMPLATE`.** Started from a substation, a bay typical used to get a new voltage level named `TEMPLATE`; it now lands in the substation's voltage level when it has one, else a level named after its kind is created.
- **`report.mappings` lists the mapping still to decide.** With several instances of one template, an instance that already carries the mapping of a shared element hid the same element still to be mapped for another instance, and a choice made for it was refused.
- **An update no longer duplicates or re-adds a shared element that landed on an element of the project.** The update looked for it by template lineage only and cloned a second one beside it: a `Variable` or `BehaviorDescription` of the same name, an `AllocationRole` mapped onto a project role, and, for a `FunctionCategory`, one more `FunctionCatRef` on every update. The review now reads one answer with apply: a category the project already holds is shown as matched, with the classification it gains, sub-categories included.
- **References point at the elements of the project, not at the template's.** A reference whose target landed on an element of the project kept the template's uuid and path, pointing at nothing: a `VariableRef` / `BehaviorDescriptionRef`, an application's `FunctionCategoryRef`, the `FunctionRef`s added to a project `AllocationRole`, and any reference added by a template update whose target was outside the subtree it came with (a function or a role the same update creates, or an element the instance already holds). Function, application and SSD updates now repoint them once everything they can point at exists; with several instances of one template, each instance points at its own elements.
- **An update with nothing to do no longer removes references from a shared element.** Applied without decisions, an update dropped from a shared `AllocationRole`, `FunctionCategory`, `Variable` or `BehaviorDescription` the reference children it could not pair with the template — the references of other instances, or the project's own. A reference of a shared element is now removed only when its removal was reported and accepted.
- **The review of a first-time application instantiate shows an `AllocationRole` that lands on an existing role of the project as such.** The report used to announce the role as added while apply added its allocations to the project role of the same name. The role now appears as a companion matched onto the project role, with only the contributed function references added; the project role's own attributes are neither compared nor written.

## [0.5.0] - 2026-10-02

### Added

- `resolveMappedData` tells which logical node and data path implement a `DOS`, `SDS` or `DAS`, also when it follows its default.
- `tx.reference.setMappedData` states which data implements a `DOS`, `SDS` or `DAS` and reports whether it was stored, is the default, or cannot be stored.
- Importing a file warns (`incoherent-reference`) when a mapped name and its `mappedLnUuid` point at different logical nodes; the uuid wins.

### Changed

- Requires `@dialecte/core` 0.5.2.
- **Breaking:** a `DOS`, `SDS` or `DAS` stores `mappedDoName` / `mappedDaName` and `mappedLnUuid` together, and only when it is not implemented by its default; `mappedLnUuid` alone no longer means "mapped".
- A mapped name is always the path from its logical node, starting at the data object (`Ind2.stVal`, never `stVal`).
- Remapping an `LNode` or a parent `DOS` / `SDS` updates the mapped data below it.
- Imported files get their mapped data in the same form, and a short mapped name under a mapped `LNode` no longer raises an unresolved-reference warning.
- `findRefsPointingTo` on a logical node also lists the `DOS`, `SDS` and `DAS` that follow it by default.
- `resolveReferencePath` answers for a `DOS`, `SDS` or `DAS` even when it stores nothing.

### Removed

- **Breaking:** `buildMappedName`; read with `resolveMappedData`, write with `setMappedData`.

## [0.4.2] - 2026-10-2

### Fixed

- `MinRequestedSCDFile` titles show `version.revision` when available, omitting empty values instead of showing the file UUID.

## [0.4.1] - 2026-09-29

### Added

- Automatically keep each IED's `MinRequestedSCDFile` for the current SCD in sync with the Header when control blocks, datasets, `ExtRef`, `DAI` values, subnetwork settings, addresses, GSE/SMV, or relevant IED attributes change. Physical connections, description-only changes, and IED `engRight`/`owner` changes alone do not trigger sync. Creation, updates, and deletions happen in the same transaction; network reassignment updates both IEDs. Entries of other projects are kept and each project is listed once: cloning an IED or adding an entry for an already listed project merges them, keeping hand-set `fileName`, `when` and `desc`. The entry uses the Header version/revision at edit time; missing values become empty, and nothing is written without a Header uuid.

## [0.4.0] - 2026-09-29

### Added

- The definition describes types and structure: `type` on attributes and text, `contentModel`, `nillable`, `anyNamespace`, text `default` / `fixed`.
- The attributes of an element as declared under each parent: `Scl.AttributesOf<'P', 'Address'>`.

### Changed

- Requires `@dialecte/core` 0.5.1.
- The SCL fixture validator (`assertValidSclXml`, `assertValidSclTestCases`) is the shared one from `@dialecte/core/test`; same names, same behaviour.
- Uuid-less `DA`, `SDO`, `*Parameters`, `InputVar` and `OutputVar` are matched by their identifying fields instead of their position.

### Removed

- `children.choices` from the definition: read the `choice` nodes of `contentModel`.

### Fixed

- Identity fields match the schema's keys: `AccessPoint`, `Server`, `DataTypeTemplates` and `History` no longer borrow their descendants', and elements keyed through a wildcard now carry their `name`, `id` or `varName`.
- `P` follows the declaration of its parent: `Address` and `PhysConn` each keep their own `type` values.
- An element's title never falls back to its uuid.

## [0.3.17] - 2026-09-18

### Changed

- **A test suite's invalid fixtures are all reported at once.** `runSclTestCases` used to stop at the first invalid case, so fixing one snippet only revealed the next. It now checks every case up front and fails once, listing each invalid case by name with its `sourceXml` / `targetXml` violations.
- **A misplaced XML declaration is explained.** A fixture whose `<?xml … ?>` follows the template literal's leading newline is malformed XML; the failure now says the declaration must be the very first characters and that an inline snippet can simply drop it, instead of relaying the parser's raw error.

### Fixed

- **Fixture validation no longer rejects vendor elements that share a name with an SCL element.** The check looked elements up by local name only, so vendor content under a `Private` — e.g. an `Address` in a vendor namespace carrying its own attributes — was validated as the SCL `Address` and failed on its namespace and every attribute. Elements in a namespace the SCL config does not declare are now left alone, matching how import already keeps them verbatim. Schema elements written in no namespace at all (an `<SCL>` root missing its `xmlns`) are still rejected.

## [0.3.16] - 2026-09-18

### Added

- **Applying a change now tells you what each previewed element became.** Every node in the change report carries an `appliedRef` after `apply` runs — the element it turned into in the resulting document (an added element resolves to its freshly-created copy, an updated one to itself). A merge-review UI can read this straight off the report instead of re-deriving the report-to-document correlation by walking structure, so a preview can no longer attach a change to the wrong element (e.g. a second instantiated bay's contents landing on the existing same-named bay).
- **Instantiate an SSD into a project.** Bring an SSD's topology into a project: it recreates the substation / voltage-level / bay structure (with its bay type and equipment) where the target does not already have it — reusing the levels the target does provide — and places the applications, the functions they use and their data types at the right levels, previewing the new structure itself alongside them. By default each copy is a fresh, traceable instance (a new identity that remembers the template it came from); a "keep" mode instead adopts the SSD's own identities as the project base. A second placement is previewed on the new bay under its collision-resolved name (e.g. `TEMPLATE_1`), never conflated with an existing same-named one. Each instantiation records the source SSD once in the project header.
- **Update a project from a newer SSD, with a preview.** A project can be reconciled against a revised SSD: the change preview lists, per application and function, what would be added or updated so you can accept, skip or edit each group before applying — the same merge-review used for functions and applications. Structural changes to the bay itself (its own attributes, bay type and equipment) are reconciled too and shown as their own group, matched to the project bay by its remembered template identity so a renamed bay still matches. New parts are instantiated, existing ones updated.
- **Scope an update to one instance.** When a template has been used more than once, an update can be aimed at a single chosen copy (its structure, applications and functions) instead of every copy; left unset, it still updates them all.
- **`preserve` identity mode.** A new clone-identity mode that keeps a fresh element identity while carrying the template lineage verbatim, so a copied element stays an instance of the same template — the primitive a future copy/paste builds on.
- **Test fixtures are checked against the SCL schema.** `createSclTestProject` and `runSclTestCases` now validate each fixture's XML — element namespaces (context-aware: an element's namespace is read from its parent context, since SCL reuses local names across namespaces), containment, and known attributes — so an invalid snippet fails fast with a clear message instead of silently exercising a tree the engine misreads. Exposed as `assertValidSclXml` for ad-hoc use.

### Changed

- **Element identity is resolved from the schema in one place.** How an element is identified — by `uuid` lineage, by an identity field like a data type's `id`, or by position — is now derived from the element definition (`identity.query.resolveIdentity`) and shared by every matcher, instead of each site guessing. A hand-authored file whose `templateUuid` lineage was filled with a placeholder value is reported by the existing template-uuid check rather than silently recovered by name.

### Fixed

- **Applying an update now pairs elements exactly as the preview does.** The change preview and the write share one element matcher, so applying can no longer match a child differently from the preview that gated it — the write carries the same cross-type template-lineage guard and reference-identity matching (a reference matches by what it points to, not by position) that the preview already used.
- **Removing an IED no longer wipes an orphaned LNode's class.** Resetting an `LNode` binding after its IED disappears used to also clear `lnClass`/`lnInst`/`prefix` when there was no `LNodeSpecNaming` to restore from — `lnClass` has no schema default, so this left the LNode with an empty, invalid class and no way to recover it. Both the cleanup pass and the binding-reconcile hook now clear only the binding itself (`iedName`, `ldInst`, `lnUuid`) and leave the naming untouched when there's nothing to restore it from, and fall back to the LNode's own class when a present `LNodeSpecNaming` doesn't carry one either.

## [0.3.15] - 2026-09-11

### Added

- **Fork now works on application templates (ASD), not just functions (FSD).** An ASD can be brought from one revision to the next while keeping its identity, and the functions it composes are forked along with it.
- **Fork carries satellites too.** The categories, allocation roles and variables attached to a forked template are updated in place — or added while keeping their own identity — instead of being treated as brand-new elements.
- **Export a bay, voltage level or substation as an SSD.** Pick one in a project and export it to a standalone SSD file. It gathers the equipment, the applications and the functions they use, plus the data types they need, into a reusable template named after what you exported. Parts that cannot be carried yet (IEDs and communication) are left out and reported back.
- **Exported SSDs stay wired up.** The connectivity between equipment now travels with it, so the single-line diagram in the exported file keeps its connections instead of dangling.

### Changed

- **Faster fork updates.** Adding elements during a fork now restores their identity in a single pass, roughly halving the work on large subtrees.
- **`writeProvenance` can now record a whole source file.** Alongside tagging a function or application root, it can note an imported file in the project header (`Header > SourceFiles`), which is how an imported SSD or SCD records where it came from. The call now takes a `target` describing which of the two to write.

### Fixed

- **Categories are no longer duplicated when exporting.** A category shared by several applications or functions is now written once, instead of being repeated for every one that uses it.

## [0.3.14] - 2026-09-07

### Added

- **`importTypes` reports progress + dev perf spans.** Progress: one nested plan spans all phases (pre-existing index → source loop → repoint → reclaim) so the sub-bar never freezes between them; captions (`Indexing existing types…`, `Importing <id>`, `Repointing references…`, `Reclaiming ids…`) ride the step advances. Perf (`dev.perf` only): `scl::importTypes` + sub-spans `::preExistingIndex`/`::sourceLoop`/`::remap`/`::reclaim`, via `perf.report()`.

### Fixed

- A template `update` that **adds** a subtree containing an internal uuid reference (e.g. a new `SubFunction` whose `SourceRef` binds to a sibling `LNode` added in the same revision) no longer leaves that reference dangling at the source uuid. The reconcile add path now runs `applyUuidRemap` over the added mappings so the reference is repointed onto the added element's fresh instance uuid — restoring the reference rewiring that the removed `afterDeepClone` hook used to do for this path (a fork add is unaffected: it keeps identity in source space).

## [0.3.13] - 2026-09-03

### Added

- `reference.applyUuidRemap(tx, { mappings })` — repoint a set of freshly cloned elements' `uuid` references to their clones and recompute the reference paths, in one pass. Deep clone now produces a faithful copy and the caller owns rewiring; the lifecycle recipes (extract/instantiate FSD + ASD) call this once over their accumulated clone mappings. This replaces the former per-clone `afterDeepClone` core hook, whose per-element scan grew quadratically during a type-closure import.

- `elementSignature(query, { signatureCache })` — an optional shared signature cache (`Map<tagName:id, signature>`, exported as `SignatureCache`). Passing one map across many `elementSignature` calls over the **same** document (e.g. every top-level type in a `DataTypeTemplates` import) signs a shared descendant once instead of per caller. Never share a cache across documents.

### Changed

- Deep clone (`lifecycle.transplant.deep`) no longer auto-rewires cloned `uuid` references; it is a pure structural copy and the caller rewires via `reference.applyUuidRemap`. The `afterDeepClone` hook registration is removed. Type import (`importTypes`) does no uuid remap at all (types carry no uuid references), which removes the previous quadratic cost on large type closures.

## [0.3.12] - 2026-07-29

### Added

- `fork` lifecycle scenario — reconcile a newer **revision of the same file** onto its prior revision, keeping identity. `query.lifecycle.report` / `tx.lifecycle.apply` / `update.fsd` accept `scenario: 'fork'`: elements match by `uuid` (not `templateUuid`), the reconcile updates in place with **no re-stamp and no provenance**, deletes elements the new revision dropped, and adds a newly added element **keeping its source uuid** (a fork converges the target to the source revision's identity) — no duplicate is added. It is the single-layer form of an SCD fork (e.g. bringing an FSD from revision _n_ to _n+1_). Implemented for the FSD layer; ASD follows.

### Changed

- **BREAKING**: the lifecycle scenario value `'update'` is renamed `'template'` (the reconcile-a-template-onto-its-instances mode). `LifecycleScenario` is now `'instantiate' | 'template' | 'fork'`, with a new `UpdateMode = 'template' | 'fork'` alias grouping the two **Update** modes. A consumer passing `scenario: 'update'` must pass `'template'`; omitting `scenario` is unchanged (still defaults to the template mode).

## [0.3.11] - 2026-07-28

### Changed

- A carried satellite's changes now fold onto its decision group as a **structured** companion — the satellite's diff root (with its nesting preserved) — instead of a flattened bag of changed descendants. When a template change only adds content into an already-existing satellite container (e.g. a new `FunctionCatRef` into a `FunctionCategory` that a prior instantiation created), the existing container rides as the companion (anchored by its `instanceRef`) carrying the added node nested inside, so a consumer can place the addition against the real container instead of guessing by tag/name.

### Fixed

- On re-instantiating a template, a node newly added into an already-existing satellite container is now surfaced (and applied) correctly: the change is no longer flattened away from its container, so merge review can show/couple it and accepting the group writes it into the existing container without duplicating the container.
- On `scenario: 'instantiate'`, a shared satellite's per-instance reference children are now reported as `added` instead of being matched to a previous instance's references. Placing another instance whose classification container (e.g. a `FunctionCategory` / `SubCategory`) already exists no longer reports a false no-op — the new references are shown as additions into the existing container, consistent with what `apply` writes (`report` no longer disagreed with `apply` for the second instantiation of a carried satellite). New internal `refsAlwaysAdded` diff option threads the scenario to the satellite fold.
- The apply gate now recurses a structured companion's subtree, so a nested accepted reference is still written (a change nested under an unchanged container is no longer dropped from what gets applied).

## [0.3.10] - 2026-07-28

### Added

- `query.lifecycle.checkTemplateUuids()` — a read-only identity-integrity check that reports definitive SCL invariant violations: a `templateUuid` reused across unrelated element types, a duplicate instance `uuid`, or a `templateUuid` that resolves in-file to an element of a different type. Lets a consumer warn about a malformed project before merging. New `TemplateUuidWarning` type.
- `TEMPLATE_UUID_WARNING_INFO` — per-code human copy (`title` / `description` / `fallback`) for the checker's warnings, so a consumer UI renders the explanation and recovery strategy from one source instead of duplicating (and drifting from) it. New `TemplateUuidWarningInfo` type.

### Changed

- The lifecycle report is now one entry per instance. `DiffReport` exposes `instances: ReportInstance[]` — each with `title`, `linked`, `upToDate`, `tree`, and `groups` — instead of the flat `roots` plus per-group `instanceScopeId`/`instanceScopeTitle`. Use `allGroups(report)` to flatten every instance's groups; `mergeReports` is replaced by `assembleReport`.

### Removed

- The editable-attribute modification delta (`before`/`after`/`changed` on `EditableAttribute`, and the changed-first ordering) is dropped — a report no longer annotates which editable fields changed on update.

### Fixed

- Update/merge no longer marks a reference (e.g. an `AllocationRoleRef`) as removed when a project reuses a placeholder `templateUuid` that differs from the template — references now fall back to matching by their resolvable target name.
- Updating a project authored with placeholder `templateUuid`s no longer duplicates catalog satellites (e.g. `AllocationRole`); the existing element is recognised by name and reconciled in place — and the update report no longer shows it as a false `added` on every instance.
- A `templateUuid` that coincides with a source `uuid` no longer causes a cross-type match — template lineage now requires the matched instance to be the same element type.
- Instantiating the same template several times no longer reports the earlier instances as falsely "outdated": a shared satellite that links to each instance (e.g. an `AllocationRole` referencing one `Function` per instantiation) keeps its sibling links instead of flagging them as removed.
- A shared satellite whose source genuinely dropped a reference to an element in its own scope now reports that instance link as `removed` (instead of blanket-keeping it), so the carrying primary is correctly flagged outdated.

## [0.3.9] - 2026-07-24

### Added

- `presentation` extension now publishes its types via the package root: `ElementTitle`, `ExtractElementTitleOptions`, `ExtractElementTitleOptionsWithLabels` (the `extractElementTitle` contract) and `TitleSpec`/`ConditionalTitle` (the title-override authoring format).
- Reference coherence is now maintained automatically as a side effect of create/update — set the stable half and `@dialecte/scl` derives the rest:
  - `mappedDoName`/`mappedDaName` on `DOS`/`SDS`/`DAS` is normalised to the implementing short name and kept only when it differs from the specified `name` (a `DAS` under an unmapped parent DO carries the implementing `DO.DA`).
  - `SourceRef`/`ControlRef`/`ProcessEcho`/`LNodeDataRef` rebuild their path qualifier from the companion `*DoName`/`*DaName` names when those change.
  - `LNode` implementation identity (`iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst`) is stamped from the target `LN` when `lnUuid` is set, and restored from `LNodeSpecNaming` when it is cleared (the specification `lnType` is preserved). `templateUuid` is left untouched it records the template the `LNode` was instantiated from (the key used to locate the implementing ICD), which is owned by the instantiate lifecycle, not by binding. The orphan-binding cleanup (`resetLNodes`) likewise preserves `templateUuid`.
- Merge review now classifies **author-added** elements — an instance element with no template lineage (e.g. a `DOS`/`DAS` under an `LNode`'s `Private`, or a local `LNode`) — as a `target-only` decision group: kept by default (`suggestedAction: 'skip'`), removed only when explicitly accepted. Pipeline naming/provenance (`LNodeSpecNaming`, `FunctionSclRef`, `ApplicationSclRef`, `SclFileReference`) is excluded. `DiffChange` gains `'target-only'`; `DecisionGroup.suggestedAction` widens to `'accept' | 'skip'`.
- `dataModel.isLNodeLocked(query, ref)` — predicate for whether an `LNode` is **locked** (bound to an IED: `iedName` set, not the `'None'` marker). A dangling binding stays locked (protected) until orphan cleanup resolves it.

### Changed

- `presentation.extractElementTitle` compact titles for `SourceRef` and `ControlRef` now reflect the connected/open state: a connected ref shows its concrete binding (`SourceRef.source`, `ControlRef.controlled`), an open ref shows the `pLN.pDO[.pDA]` specification hint. Both now lead with the mandatory identifier (`input`/`output`) instead of the hint alone. `TitleSpec` gains a `ConditionalTitle` variant form to express this.
- `transplant.deep` (and its consumers — extract, instantiate, layer clones) now drops elements of a **supported** namespace (`default` / `eIEC61850-6-100`) that the 2019C1 schema no longer defines — deprecated/unknown elements such as `SsdReference` (superseded by `SclFileReference`) — together with a `Private` wrapper left holding only such elements. An empty `Private` whose `type` names a namespace we own (e.g. `eIEC61850-6-100`) is also dropped. Foreign/vendor privates (including empty vendor flags) and privates that also contain a known element are still preserved verbatim.
- `buildReferencePath` for `lnode` references now takes the DO/DA qualifier from the companion attributes when the stored path already carries one (a path that stops at the LN level stays companions-only). It returns `null` for `DOS`/`SDS`/`DAS`, whose `mappedDoName`/`mappedDaName` is authored documentation produced by the hooks rather than a rebuildable path.
- `update.asd`/`lifecycle.apply` no longer returns a matched instance among the applied roots when all of that instance's changes were skipped, so a consumer's post-apply policy runs only on instances that were actually reconciled.
- A decision group's `suggestedAction` is now the default when the group is **absent** from the decision map (previously an absent decision always meant `accept`); only `target-only` groups default to `skip`.
- `report` surfaces a **satellite-only** change — a satellite (`FunctionCategory`, `AllocationRole`, `Variable`, `BehaviorDescription`) that changed while its primary did not — as its own decision group instead of dropping it (removals still ride the primary group).
- A locked `LNode` owns its implementation identity (`iedName`/`ldInst`/`prefix`/`lnClass`/`lnInst`) and `lnType`: a template reconcile (`update`/`instantiate`), type dedup (`importTypes`), and orphan-binding cleanup (`resetLNodes`) never overwrite, remap, or reset them — even on a UI-instructed edit. Type-id reference attributes (`lnType`, `DO`/`SDO`/`DA`/`BDA` `type`) are now classified `reference` (system-owned).

### Fixed

- `reconcile`/`apply` now **clears an attribute the updated template dropped** (present on the instance, absent from the template) instead of leaving the stale value — so a removed optional attribute (e.g. `desc`) is reflected in the result and its XML diff.
- **Nested changes inside a satellite subtree** (e.g. a `SubCategory` inside a `FunctionCategory`) are now applied when the owning group is accepted, instead of being silently skipped.
- **Author-added `DOS`/`SDS`/`DAS`** (and other content-bearing references) are no longer removed on update: the dropped-link removal excludes the `KEEP_ON_ORPHAN_REFS` content tags (`DOS`/`SDS`/`DAS`, `SourceRef`, `ControlRef`, `InputVar`/`OutputVar`, `ProcessEcho`), so an author-added one is `target-only` — kept by default.

## [0.3.8] - 2026-07-24

### Fixed

- First-time instantiate now reports a Function's satellites (`FunctionCategory`, `Variable`, `BehaviorDescription`) as added companions, so a merge review shows everything that will be created — not just the function subtree.

## [0.3.7] - 2026-07-23

### Added

- `keepNameTypesFrom` option on `dataModel.importTypes` and `lifecycle.apply` (and `transplant.deep` via `withTypes: { keepNameFrom }`) — on a type-dedup name clash, choose whether the target (default) or the source keeps the type name.

### Fixed

- Vendor `Private` elements are now preserved when cloning a subtree (`transplant.deep`, extract, instantiate) — text-only privates and empty flag privates are no longer dropped; only a truly-empty `Private` (no children, value, or `type`) is skipped.

## [0.3.6] - 2026-07-22

- Add `DataTypeTemplates` to lifecyle report presentation scope

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
- Title overrides for `eIEC61850-6-100` namespace elements and core SCL elements: `ExtRef`, `FCDA`, `ConnectedAP`, `ControlRef`, `SourceRef`, `FunctionRef`, `ApplicationSclRef`, `LNodeSpecNaming`, `SubscriberLNode`, `ControllingLNode`, `InputVar`, `OutputVar`, and more.

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
