import type { FSD_PLACEABLE_ROOT_TAGS } from './contract.constants'
import type { Scl, Config } from '@/v2019C1/config'
import type { TopologyStructuralTag } from '@/v2019C1/constants'
import type { KeepNameTypesFrom } from '@/v2019C1/extensions/data-model/transaction'
import type { AppliedInstances } from '@/v2019C1/extensions/lifecycle/apply/apply.types'
import type { DecisionMap, DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type { DecisionMappings } from '@/v2019C1/extensions/lifecycle/mapping/mapping.types'
import type * as Core from '@dialecte/core'

/**
 * Which layer the lifecycle surface operates on: a function (FSD), an application (ASD), a substation template (SSD),
 * or an IED (`ied`, read from an ISD, ICD, IID or SCD file).
 */
export type LifecycleVerb = 'fsd' | 'asd' | 'ssd' | 'ied'

/**
 * The two reconcile modes of the `Update` operation, distinguished by how the
 * SOURCE relates to the TARGET:
 *  - `template` — source is a TEMPLATE; reconcile it onto its EXISTING
 *    instance(s). Match by `templateUuid` (= source `uuid`), stamp lineage on
 *    added elements, rotate provenance. Was `update`.
 *  - `fork` — source is a newer REVISION of the SAME file; reconcile it onto the
 *    prior revision, KEEPING identity. Match by `uuid` (source and target share
 *    it), no re-stamp, no provenance. The single-layer form of an SCD fork.
 */
export type UpdateMode = 'template' | 'fork'

/**
 * Which lifecycle operation the user chose:
 *  - `instantiate` — place a NEW instance of the template (duplicates allowed;
 *    a sibling name collision is resolved). Re-applying the same template yields
 *    another instance, never a silent no-op.
 *  - `template` / `fork` — the two {@link UpdateMode} reconcile modes.
 *
 * Picked explicitly by the consumer (or auto-detected from the source↔target
 * relationship) — it cannot be inferred reliably (a same-version re-upload is a
 * valid duplicate). Defaults to `template` for back-compat.
 */
export type LifecycleScenario = 'instantiate' | UpdateMode

/** The function an FSD carries: one of {@link FSD_PLACEABLE_ROOT_TAGS}. */
export type FsdFunctionRef = Scl.Ref<(typeof FSD_PLACEABLE_ROOT_TAGS)[number]>

/** A function of a source file the function layer reads: any of the forms a template gives it. */
export type SourceFunctionRef = FsdFunctionRef | Scl.Ref<'SubFunction'>

/**
 * What to reconcile and where — the uniform `{ verb, sourceQuery, ref, anchor }`
 * descriptor shared by `report` (read-only classify) and `apply` (write).
 * Discriminated on `verb` so `ref` narrows to the right element type, and on `scenario`: only a
 * fork takes the previous revision of the file ({@link LifecycleRevisionBase}).
 */
export type LifecycleTarget = LifecycleVerbTarget & LifecycleRevisionBase

/**
 * The previous revision of the file a fork reconciles from (`baseQuery`): an element the project
 * holds that the newer revision lacks is removed only when the previous revision held it — one it
 * never held is the project's own. Without it, every such element is the project's own, kept by
 * default. Another scenario takes none.
 */
export type LifecycleRevisionBase =
	| { scenario?: Exclude<LifecycleScenario, 'fork'>; baseQuery?: never }
	| { scenario: 'fork'; baseQuery?: Core.Query<Config> }

/** The verb arm of a {@link LifecycleTarget}. */
export type LifecycleVerbTarget =
	| {
			verb: 'fsd'
			sourceQuery: Core.Query<Config>
			/** The source (template) function to reconcile. */
			ref: FsdFunctionRef
			/** Target parent the instance lives under / is placed into. */
			anchor: Scl.Ref<Scl.ElementsOf>
			/** Operation to perform. Defaults to `template`. */
			scenario?: LifecycleScenario
			/** Multi-instance anchor: scope to ONE target instance (or its subtree). Absent = all. */
			targetInstance?: Scl.Ref<Scl.ElementsOf>
	  }
	| {
			verb: 'asd'
			sourceQuery: Core.Query<Config>
			/** The source (template) Application to reconcile. */
			ref: Scl.Ref<'Application'>
			/** Target parent the composed functions are placed into. */
			anchor: Scl.Ref<Scl.ElementsOf>
			/** Operation to perform. Defaults to `template`. */
			scenario?: LifecycleScenario
			/** Multi-instance anchor: scope to ONE target instance (or its subtree). Absent = all. */
			targetInstance?: Scl.Ref<Scl.ElementsOf>
	  }
	| {
			verb: 'ssd'
			sourceQuery: Core.Query<Config>
			/**
			 * The element of the SSD to act on: a named Substation, VoltageLevel or Bay is the scope; the `TEMPLATE`
			 * scaffolding is walked down to the one unit it holds. Several units at the first named level and the
			 * scaffolding above them named: refused with `SSD_SCOPE_AMBIGUOUS`, listing them, to ask again naming one.
			 */
			ref: Scl.Ref<TopologyStructuralTag>
			/** Target parent the SSD content is placed under (e.g. a project Bay). */
			anchor: Scl.Ref<Scl.ElementsOf>
			/** Operation to perform. Defaults to `template`. */
			scenario?: LifecycleScenario
			/**
			 * Multi-instance anchor: scope to ONE target instance (a specific placed Bay) — the frame,
			 * its Applications and composed Functions all resolve under it. Absent = all instances.
			 */
			targetInstance?: Scl.Ref<Scl.ElementsOf>
	  }
	| {
			verb: 'ied'
			sourceQuery: Core.Query<Config>
			/** The IED of the source file to place in the project. */
			ref: Scl.Ref<'IED'>
			/** The root of the project the IED is placed under. */
			anchor: Scl.Ref<'SCL'>
			/**
			 * Operation to perform. Defaults to `template`. Only a first placement is reported: `template` or `fork`
			 * finding the IED already in the project is refused with `OPTION_NOT_AVAILABLE`.
			 */
			scenario?: LifecycleScenario
			/**
			 * One IED of the project to scope to. Not read yet: only a first placement is reported, which places a new IED
			 * whatever this names.
			 */
			targetInstance?: Scl.Ref<'IED'>
	  }

/**
 * Whether an LNode bound to an IED takes the type a newer template gives it: `follow` (the type is part of what the
 * template specifies, the implementation does not change it), or `keep` (the project keeps the type it holds, the
 * template's change listed as kept).
 */
export type BoundLogicalNodeTypes = 'follow' | 'keep'

/**
 * Whether a reference of the project whose uuids disagree with the template's pairs with it by the names of what both
 * name: `never` (uuids only: such a reference is listed removed and the template's added), or `placeholders` (only
 * where the lineage the project's element carries is one `checkTemplateUuids` flags — a placeholder smeared over
 * elements of several types, or naming an element of another type; each such pairing is listed in
 * `DiffReport.warnings`).
 */
export type ReferencesByName = 'never' | 'placeholders'

/**
 * What a first placement of an application does with a function it composes that the level it lands on already
 * holds with an identical template reference (placed for another application): `clone` (a function of its own, placed
 * beside), or `merge` (it stands on that one: one found is taken, several are the consumer's to choose, none is
 * placed).
 */
export type SharedFunctions = 'clone' | 'merge'

/**
 * What the consumer resolved, handed to the lifecycle surface as ONE object:
 *  - `decisions` — accept / skip (and edited values) per decision group;
 *  - `mappings` — where a shared source element lands, per source element, when the consumer
 *    chose otherwise than the report resolved;
 *  - `keepNameTypesFrom` — on a type dedup, which side's id/name the surviving type keeps
 *    (forwarded to `importTypes`; default `'target'`, the destination authority);
 *  - `boundLogicalNodeTypes` — whether a bound LNode takes the type the template gives it (default `'follow'`). Read by
 *    `report`: a kept type change is listed as kept; `apply` writes the type changes the report lists;
 *  - `referencesByName` — whether a reference whose uuids disagree pairs by name on a flagged placeholder lineage
 *    (default `'never'`); `report` and `apply` read it alike;
 *  - `sharedFunctions` — whether a first placement of an application merges a function it composes into one another
 *    application placed there (default `'clone'`); `report` and `apply` read it alike;
 *  - `consumerManagedTags` — the element tags the consumer creates on instances and maintains itself (default none).
 *    Read by `report`: an instance element of such a tag known not to be the template's is not listed as the
 *    project's own (`target-only`) — one that may be the template's own, dropped (it carries the template's lineage, or
 *    a uuid in a fork given no previous revision), still is; `apply` writes what the report lists;
 *  - `afterApply` — the consumer's own step, run by `apply` once it wrote (see {@link AfterApplyHook}).
 */
export type Resolution = {
	decisions?: DecisionMap
	mappings?: DecisionMappings
	keepNameTypesFrom?: KeepNameTypesFrom
	boundLogicalNodeTypes?: BoundLogicalNodeTypes
	referencesByName?: ReferencesByName
	sharedFunctions?: SharedFunctions
	consumerManagedTags?: readonly Scl.ElementsOf[]
	afterApply?: AfterApplyHook
}

/**
 * A consumer's own step after the whole apply, in the same transaction: what it writes is
 * applied, previewed and committed with the rest (a preview run with `doc.prepare` shows it). It
 * receives what the apply placed or reconciled — only the instances it wrote — and decides by
 * itself what to do with them (how to name them, what to wire them to). The engine knows nothing
 * of it; to tell a name apart from a taken one it calls `tx.lifecycle.makeUnique`. Not run when
 * nothing is written (decisions still to take).
 */
export type AfterApplyHook = (
	tx: Scl.Transaction,
	params: { instances: AppliedInstances },
) => Promise<void>

/**
 * `report` inputs: the target, and what the consumer already resolved. The report is
 * re-derived from it, so it shows the consequence of each choice.
 */
export type LifecycleReportParams = LifecycleTarget & {
	resolution?: Resolution
}

/**
 * `apply` inputs: the target plus the `report` produced by `report` (the
 * consumer classifies first, then applies). The report gates what is written.
 *
 * `resolution.decisions`: present -> apply the accepted groups only (a group absent from the map takes its suggested
 * action). Absent -> on the full track the caller has not decided yet (apply writes nothing and returns the report);
 * on the fast track every group takes its suggested action: what the report lists is written, an element the project
 * added is kept.
 */
export type LifecycleApplyParams = LifecycleTarget & {
	report: DiffReport
	resolution?: Resolution
}
