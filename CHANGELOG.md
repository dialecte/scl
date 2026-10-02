# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## UNRELEASED

### Added

- **Where the levels of an SSD land is a mapping.** On `instantiate`, `lifecycle.report` lists each structural level of the template (`Substation`, `VoltageLevel`, `Bay`) first in `mappings`, top-down, each with `dependsOn` (the level above) and, as `candidates`, the elements of the project below the one the level above lands on. A level above the unit to instantiate lands on the level of the element the consumer started from (`reason: 'anchor'`), else on the only such level there is (`reason: 'only'`); with none it is created, named after its kind; with several, none is picked: the mapping is listed without a `mapping` (`ambiguous`), every level below it waits (no `mapping` either), `needsDecisions` is `true` and `apply` refuses until the consumer chose one or asked for a new one. The unit and the levels below it are created under a name free where they land. The consumer can map any level onto a candidate or name the new one (`resolution.mappings`); `apply` places the content accordingly, whatever element it was started from. A level of the unit mapped onto an element of the project receives the content that element lacks; what it holds is left as it is, it is not renamed and gets no lineage. On an update, each instance lists the levels it already sits on (`locked`): a level created from the unit is found by its lineage, a level of the project the unit was mapped onto as the one holding what the placement put there — it then only receives what the template contributes. An operation asked as an update on a project that holds no instance yet is a first placement: its levels are listed and followed alike. The shared elements of the template are looked for from where it lands (the deepest level of the project its unit sits on or below), not from the element the consumer started from. The name the review offers for the placed unit is the one its mapping carries (`suggestedValue`), flagged `conflict` only when the engine changed it; a value edited in the review still has the last word. On the report `apply` returns, each mapping carries `appliedRef`: the element it is mapped onto, or the one created for it. `MappingReason` gains `'anchor'` and `'only'`; `ReportMapping` gains `dependsOn` and `appliedRef`, and its `mapping` becomes optional.

- **Variables and behaviour descriptions are listed in `mappings`.** Where a `Variable` or a `BehaviorDescription` lands is resolved by the same rules and listed with `selectable: false` — shown, not chosen.
- **Function categories are mapped like roles.** `lifecycle.report` lists a `FunctionCategory` the template brings in `mappings` — for a function, an application's composed functions and an SSD — with the project category it lands on or the new one, and the consumer chooses with `resolution.mappings`. Inside a category of the project, a `SubCategory` lands on the project's sub-category of the same name.
- **An update keeps the mappings an instantiate made.** For each instance, `report` and `apply` find the project element it already holds for a shared source element — from the element's lineage, from the references the mapping gave it, from its name, or because it is the only one — and keep it: the mapping is listed with `reason: 'lineage'` and the new `locked: true`. A project element a role was mapped onto only receives what the template contributes; its own attributes and children are left alone and it is never deleted. A shared element the instance holds nothing for is resolved as on a first placement and can be chosen; one that cannot be told apart is listed with `ambiguous: true` instead of being guessed. A choice made for one of those settles the others: what is left is paired again without it, so an element that is then plainly new is no longer flagged and one that is the only one left for the element the instance holds is mapped there.
- **A shared element the template drops takes back what the instance gave.** The project element it was mapped onto stays, with its own attributes and children; the references the instance had contributed to it are announced as removed and removed when accepted.
- **A shared element created by an earlier placement is proposed first** (`reason: 'lineage'`), whatever it is named now, before the element of the same name.
- **Choose where a shared element lands.** `lifecycle.report` now returns `mappings`: for each `AllocationRole` a first-time application placement brings, where it lands (an existing role of the project, or a new one), why, and every project role it could land on instead, listed from the placement outwards. Pass a choice in `resolution.mappings` — `{ existing: ref }` or `{ create: { name? } }` — to `report` to see its consequence in the report and the review tree, then to `apply` to carry it out: the application's role reference (uuid and path) points at the chosen role, or at a role created under the requested name, made free where it is taken. A choice the report cannot honour is refused. Works for an application placed directly and for the applications an SSD carries. New types: `ReportMapping`, `DecisionMapping`, `MappingCandidate`, `DecisionMappings`, `LifecycleReportParams`.
- **Test fixtures are checked for coherent references.** `runSclTestCases` and `createSclTestProject` now also verify, for every reference carrying a uuid, that the uuid is carried by an element of the same document that the reference can point at and, for plain name-path references, that the written path is the path of that element. A fixture that could not occur in a real file fails up front, with the path to write, instead of exercising reference handling on impossible data. A case that needs an incoherent reference says why with `allowIncoherentReferences: '<reason>'` and is left unchecked. `assertCoherentSclReferences` is exported for ad-hoc use.

### Changed

- **One `cloneMappings` per result; `recordMappings` is gone.** `transplant.deep`, `instantiate.fsd`, `instantiate.asd` and `instantiate.ssd` each return a single `cloneMappings`: every source record the operation cloned and the copy made of it. `instantiate.fsd` and `instantiate.asd` used to return two lists (`recordMappings` for the subtree, `cloneMappings` for everything), and `instantiate.ssd` returned only the partial one. Breaking for callers: read `cloneMappings` instead of `recordMappings`; on `instantiate.ssd` the list now also holds the variables and behaviour descriptions carried with the scope.
- **Several project variables or behaviour descriptions with the name of an incoming one: none is picked**, as for roles and categories; the element is created under a free name.
- **Several project categories with the name of an incoming `FunctionCategory`: none is picked.** The first one found used to receive the classification. The category is now created, under a free name, and listed with `ambiguous: true`.
- `lifecycle.transplant` `mergeChildrenInto` returns `{ cloneMappings, redirectMappings }` (was the clone mappings alone), and finds the twin of a source container by its lineage before its name.
- **`ReportMapping` has a required `locked` field and `MappingReason` gains `'lineage'`.** A choice for a locked mapping is refused by `report` and `apply`.
- **Clone mappings are named `cloneMappings` everywhere.** The `mappings` parameter of `identity.transaction.writeIdentity`, `identity.transaction.restoreClonedUuids` and `reference.transaction.applyUuidRemap` is now `cloneMappings`, and so is the `mappings` field of the results of `instantiate.fsd` and `instantiate.asd`. Breaking for callers: rename the key. The engine now tells four kinds apart by name — `cloneMappings` (a source record and its copy), the `mappings` of a report and of a `resolution` (where a shared element lands, as resolved and as chosen) and `redirectMappings` (references repointed to an existing element).
- `reference.transaction.applyUuidRemap` also takes `redirectMappings` — source elements mapped onto elements the target already holds — and repoints the references to them like the cloned ones; the application clone no longer repoints role references by hand.
- **`lifecycle.report` takes the same `resolution` object as `apply`** (optional), and every `DiffReport` and `ReportInstance` carries `mappings`.
- **`lifecycle.apply` takes what the consumer resolved as one `resolution` object.** `decisions` and `keepNameTypesFrom` move from the top level of the parameters into `resolution: { decisions?, keepNameTypesFrom? }`. Breaking for callers: `apply(tx, { ...target, report, decisions })` becomes `apply(tx, { ...target, report, resolution: { decisions } })`. The `Resolution` type is exported.
- **Several project roles with the name of an incoming `AllocationRole`: none is picked.** Apply used to take the first one it found. The role is now created, and a name already taken at its level is bumped to a free one, like any placed element.
- The check is on for every consumer of `@dialecte/scl/v2019C1/test`: a test suite whose fixtures write a wrong path or a uuid that points at nothing now fails until the fixture is corrected or the case opts out.

### Removed

- `DecisionGroup.conflict` and the `GroupConflict` type. The report set them for a placement collision whose key fields are all identity and documented a "skip or adopt" decision, but `apply` never read the field and no placed element can reach that case: every group primary is keyed by its name. The per-attribute `conflict` / `suggestedValue` on `editableAttributes` is unchanged.

### Fixed

- **On an SSD update, a function or an application the template gained lands in each instance's own level.** It used to be placed once, under the element the update was started from (a function gained by a bay typical landed beside the bays). It is now placed in the bay each instance lives in — the one created from the typical, or the one of the project it was mapped onto.
- **An SSD placed from an element above the level it needs no longer creates a level named `TEMPLATE`.** Started from a substation, a bay typical used to get a new voltage level named `TEMPLATE`; it now lands in the substation's voltage level when it has one, else a level named after its kind is created.
- **`report.mappings` lists the mapping still to decide.** With several instances of one template, an instance that already carries the mapping of a shared element hid the same element still to be mapped for another instance, and a choice made for it was refused.
- **An update applied without decisions no longer duplicates a `Variable` or a `BehaviorDescription` that had landed on an element of the project.** The update looked for it by template lineage only and cloned a second one of the same name.
- **A `VariableRef` / `BehaviorDescriptionRef` to a variable or behaviour description that landed on the project's points at it**, instead of keeping the template's uuid and path.
- **The review shows a `FunctionCategory` the project already holds as matched, with the classification it gains.** The report announced the category as new while apply added the reference to the project's category of that name; both now read one answer, sub-categories included.
- **Updating a function no longer adds a second classification to a project category.** When the function's category had landed on a category of the project, every update added one more `FunctionCatRef` to it while the review announced nothing.
- **An application's `FunctionCategoryRef` points at the project's category.** When the category it selects landed on a category or sub-category of the project, the reference kept the template's uuid and path.
- **An update no longer duplicates an `AllocationRole` that was mapped onto a project role.** The update looked for the role by template lineage only, found none on a project-owned role, and cloned a second one beside it while the review announced a new role.
- **An update with nothing to do no longer removes references from a shared element.** Applied without decisions, an update dropped from a shared `AllocationRole`, `FunctionCategory`, `Variable` or `BehaviorDescription` the reference children it could not pair with the template — the references of other instances, or the project's own. A reference of a shared element is now removed only when its removal was reported and accepted.
- **The references an update adds point at the elements of the project.** A reference added by a template update whose target was outside the subtree it came with — a function or a role the same update creates, or an element the instance already holds — kept the uuid and path of the template element, pointing at nothing in the project. Function, application and SSD updates now repoint them once everything they can point at exists; with several instances of one template, each instance points at its own elements.
- **The function allocations added to a project `AllocationRole` point at the instantiated functions.** When an incoming role landed on a role of the project, the `FunctionRef`s added to that role kept the template's function uuid and path — references to nothing in the project. They are now repointed like every other cloned reference.
- **A first-time SSD apply correlates the variables and behaviour descriptions it carried.** Their report nodes had no `appliedRef` after `apply`, because the correlation read a list that left them out; function and application instantiates were not affected.
- **The review of a first-time application instantiate shows an `AllocationRole` that lands on an existing role of the project as such.** The report used to announce the role as added while apply added its allocations to the project role of the same name. Both now read one answer: the role appears as a companion matched onto the project role, with only the contributed function references added, and the project role's own attributes are neither compared nor written.

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
