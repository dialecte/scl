# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## UNRELEASED

### Changed

- **An LNode assigned to no IED keeps the logical device it is specified in.** Unlocking it (`dataModel.unlockLNode`), clearing its `lnUuid`, or releasing a binding to a logical node the document lacks now takes `ldInst` back from its `LNodeSpecNaming` (`sLdInst`), like its prefix, class and instance; it was removed. Without an `sLdInst`, `ldInst` is still removed.

### Fixed

- **Updating a template no longer unbinds the project's bound LNodes.** An `LNode` bound to an IED by its `lnUuid` lost it on every template update (a template carries none), and was then assigned to no IED, sometimes keeping the device's prefix and instance. A bound `LNode` now keeps where it is implemented (`iedName`, `ldInst`, `prefix`, `lnClass`, `lnInst`, `lnUuid`) and its `lnType` through every update, a `fork` included; what the template specifies for it is written to its `LNodeSpecNaming`.
- **The review of an update no longer announces changes to a bound LNode's implementation.** `query.lifecycle.report` listed every difference between the template and the bound `LNode` (`iedName` to `None`, `lnInst`, `lnUuid` removed...), most of which apply did not write. They are no longer compared; a specification change shows on the `LNodeSpecNaming`.
- **Instantiating or updating a template no longer leaves LNodes bound to a device the project does not hold.** A template's `LNode` bound to its own IED kept that binding once placed, naming a logical node absent from the project, and stayed locked against every later update. `tx.lifecycle.apply` now looks at the implementation it wrote (the `LNode`s, data and signals it created, a level it created included, and those whose binding or reference it changed): an `LNode` bound to a logical node the project lacks is assigned to no IED, its naming back from `LNodeSpecNaming`, and a `DOS` / `SDS` / `DAS` or `SourceRef` / `ControlRef` naming a logical node, `ExtRef` or `ExtCtrl` the project lacks loses that name. A `fork` whose project holds the logical node keeps the binding; what the run did not write is not touched. An added `LNode` written `iedName="none"` (lowercase, not the unallocated marker) comes out `iedName="None"`.
- **`cleanUp.resetLNode` judges a binding by its logical node, not by an IED of that name**, and leaves `LNodeSpecNaming` as specified. An `LNode` bound to an IED that exists but does not hold its logical node is now released; with an `lnUuid`, only the logical node of that uuid counts. `sIedName` and `sLdInst` are no longer rewritten (`sIedName="None"` before). It also removes the `DOS` / `SDS` / `DAS` and `SourceRef` / `ControlRef` names that point at nothing, and takes `{ elements }` to look at some elements only. The extract clean-up uses it.

### Added

- **An `ExtRef` and an `ExtCtrl` now have a `state` in `info.of`** (and `info.ofEach`), read from how completely they are written: `empty` (nothing), `later-binding` (only the internal address `intAddr` it will land on), `expected` (the signal is named: its logical node by `lnUuid` or by IED, logical device and logical node class, and its data object), `subscribed` (an `ExtRef` that also has a `serviceType` and names the control block publishing it, or whose service is published without one; no `intAddr`), `bound` (the signal, the service, the control block when it needs one, and the `intAddr`). An `ExtRef` without `serviceType` stays `expected` whatever else it names. An `ExtCtrl` has no `subscribed`. The types `ExtRefState` and `ExtCtrlState` are exported, and `ElementStateByTag` gains both tags.
- **Renaming an IED, an access point, a logical device, a logical node or a control block updates the references naming it by attributes.** The `ConnectedAP`, `ExtRef`, `FCDA`, `GSE` / `SMV`, `ClientLN`, `IEDName`... pointing at it (or at an element below it) by uuid write its new names in the same transaction, only those that differ: a name its target leaves out (no prefix) is removed, a part left to its schema value or to another of its attributes (`srcLDInst` left to `ldInst`) stays left out, `iedName="@"` stays. Renaming a `DataSet` updates the `datSet` of the control blocks publishing it.
- **`applyUuidRemap` repoints the cloned references named by attributes** onto the clone of what they name (or the element a redirect maps it onto), as it does for the other references, and writes that element's names (`iedName="@"` replaced by the IED's name when that element is in another IED).
- **Importing a file fills the uuid of the IED-section references that name their target by attributes.** A `ConnectedAP` or `KDC` without `apUuid`, an `ExtRef` without `lnUuid` or `srcCBUuid`, an `FCDA`, `ClientLN`, `Association` or `ExtCtrl` without `lnUuid`, a `GSE` or `SMV` without `cbUuid`, an `IEDName` without the uuid of what it names, a `ServerAt` without `apUuid`: each gets the uuid of the access point, logical device, logical node or control block its names name in the file (`iedName="@"` naming the IED the reference sits in, an `ExtRef`'s `serviceType` telling control blocks of the same name apart). A name naming nothing in the file, or several elements it cannot tell apart, is left as written. `TUPLE_REFERENCE_PAIRS` lists these references and the attributes naming their target (types `TupleReferencePair`, `TupleRoles`, `TupleRole`, `IedRole`).

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
