import type { EditableAttribute, IdentityCollision } from '../constraints'
import type { LifecycleScenario, LifecycleVerb } from '../contract.types'
import type { OffLevel } from '../layers/topology/resolve-primary-placement.types'
import type { ReportMapping } from '../mapping/mapping.types'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/** How a diffed element changed between the (updated) template and the instance. */
// `target-only` = an instance element with NO source lineage (author-added after
// instantiation). It is preserved by default and only removed on explicit accept.
export type DiffChange = 'added' | 'removed' | 'modified' | 'unchanged' | 'target-only'

export type AttributeChange = { name: string; before?: string; after?: string }

/**
 * Why an update keeps the project's value of an attribute the template changes.
 * - `bound-logical-node`: the LNode is bound to a logical node of an IED and the consumer keeps the type of such an
 *   LNode (`resolution.boundLogicalNodeTypes: 'keep'`); by default its type follows the template's, as it is part of
 *   what the LNode was specified with.
 * - `instance-configuration`: the instance configures it where it sits (a behaviour description's file, a variable's
 *   value); a template update does not overwrite it.
 */
export type KeptAttributeReason = 'bound-logical-node' | 'instance-configuration'

/** A difference the update lists but does not apply: the project keeps `before`, the template says `after`. */
export type KeptAttributeChange = AttributeChange & { reason: KeptAttributeReason }

/**
 * One element's attributes compared: the changes an accepted update writes, its type references naming a type of other
 * content, and those it keeps.
 */
export type AttributeComparison = {
	changes: AttributeChange[]
	typeChanges: AttributeChange[]
	kept: KeptAttributeChange[]
}

export type DiffNode = {
	change: DiffChange
	tagName: string
	/** Source (template) element — present for `added` / `modified` / `unchanged`. */
	sourceRef?: AnyRefOrRecord
	/** Instance element — present for `removed` / `modified` / `unchanged`. */
	instanceRef?: AnyRefOrRecord
	/**
	 * The element this node became in the APPLIED document, filled by `apply` on the report it
	 * returns (undefined on a pure `report`). Completes the source/instance/applied triple: a
	 * matched/modified node resolves to its `instanceRef` element, an `added` node (and added
	 * companions) to its freshly-cloned element, a `removed` node to nothing. Lets a consumer relate
	 * the report to the apply result by reading the node — no structural re-correlation.
	 */
	appliedRef?: AnyRefOrRecord
	/** Attribute deltas — present for `modified`. */
	attributeChanges?: AttributeChange[]
	/**
	 * The type references of the element (an `LNode`'s `lnType`) whose type the template gives other content than the
	 * project's — `before` the id the instance names, `after` the id the template names (in its own document: the two
	 * may be equal) — present for `modified`. Accepted, the update brings the template's type into the project through
	 * its closure (an equal type the project holds reused, a free id kept, a taken one forked) and points the element at
	 * it; the type it leaves goes when nothing else names it. An equal type under another id is no change.
	 */
	typeChanges?: AttributeChange[]
	/**
	 * The text the template gives an element holding text only (a vendor `Private`, a `BayType`), when it differs from
	 * the instance's — present for `modified`: written as an attribute change is, kept when declined.
	 */
	textChange?: TextChange
	/**
	 * The template's changes the update does not apply, with why — present on a matched node (`modified` or
	 * `unchanged`) that has any. They neither make the node `modified` nor open a decision: there is nothing to accept.
	 */
	keptAttributeChanges?: KeptAttributeChange[]
	/**
	 * Present on an `added` node that collides with an element the instance holds where it lands, on a key none of
	 * whose fields can be changed (an `LNode` sharing class, instance, prefix, device and IED with one the project
	 * added): its group cannot be accepted unless an accepted group removes `collidesWith` — `apply` refuses it with
	 * `IDENTITY_COLLISION` before anything is written.
	 */
	identityCollision?: IdentityCollision
	/**
	 * Present on a reference paired with the template's by the names of what both name, their uuids disagreeing: the
	 * placeholder lineage of the project's target that let it (`Resolution.referencesByName: 'placeholders'`). Listed
	 * in `DiffReport.warnings`.
	 */
	pairedByName?: string
	children: DiffNode[]
}

/** An element's text, as the instance holds it (`before`) and as the template gives it (`after`). */
export type TextChange = { before: string; after: string }

export type DiffSummary = {
	added: number
	removed: number
	modified: number
	/**
	 * The template's changes the update lists but does not apply (`keptAttributeChanges` across the tree). They open
	 * no decision: an instance can be `upToDate` and still carry some.
	 */
	kept: number
}

/**
 * The engine's per-instance diff primitive: one instance's change `root` tree, its
 * decision `groups`, and its `summary`. The report builders enrich this into a
 * {@link ReportInstance} (title / linkage) and aggregate several into a
 * {@link DiffReport}. Internal to the report pipeline — consumers see `DiffReport`.
 */
export type InstanceDiff = {
	root: DiffNode
	groups: DecisionGroup[]
	summary: DiffSummary
	/** Where the shared source elements this instance refers to land in the project. */
	mappings?: ReportMapping[]
}

/**
 * A decision unit for the full track. The user decides
 * on a GROUP, never on an individual element.
 *
 * - `primary` is the recognizable change ("add Function X").
 * - `companions` are its dependent changes that TRAVEL with it (structural
 *   content now; reference-linked satellites / type-closure / provenance are a
 *   follow-up). They are display-only — never independently toggled.
 * - `dependsOn` are group ids this group requires (skip a parent → its
 *   dependents are disabled). Empty in the first slice.
 */
export type DecisionGroup = {
	/** Stable key of the primary; also the key in the `decisions` map. */
	id: string
	change: Exclude<DiffChange, 'unchanged'>
	/** Coarse label (`"<change> <tag>"`); the UI enriches it via `info.of(primary.sourceRef ?? instanceRef)`. */
	title: string
	primary: DiffNode
	companions: DiffNode[]
	dependsOn: string[]
	suggestedAction: 'accept' | 'skip'
	/**
	 * The primary element's user-editable attributes with their edit mode
	 * (schema-derived via the attribute classifier), tagged at report time so the UI
	 * renders inputs directly from the report without re-deriving. Omitted until the
	 * report surface tags it.
	 */
	editableAttributes?: EditableAttribute[]
	/**
	 * What accepting the group makes the delete hooks do outside what it removes: each reference elsewhere in the
	 * project naming an element the group removes, `deleted`, or `cleared` when it keeps its content (a signal input,
	 * a data setting: its uuid, path and companion attributes go). Read only: nothing to decide, the apply writes it
	 * with the removal. Absent when nothing outside is touched, or the group removes nothing.
	 */
	sideEffects?: RemovalSideEffect[]
}

/** A reference outside what a group removes that the removal deletes or clears: see `DecisionGroup.sideEffects`. */
export type RemovalSideEffect = {
	element: { tagName: string; id: string }
	effect: 'deleted' | 'cleared'
}

/**
 * One instance in a report: a linked template instance (`Application`/`Function`) with
 * its diff tree, its decision groups, and its linkage/up-to-date status. The report is a
 * list of these — a changed instance and an up-to-date instance render through the same
 * shape (the up-to-date one simply has no `groups`).
 */
export type ReportInstance = {
	/** The instance root record (`Application`/`Function`). Omitted for a first-time instantiate. */
	rootRef?: AnyRefOrRecord
	/**
	 * A first placement made several times (a primary the template gained, placed for each instance of
	 * the template): the project element this one is made for — the level it lands under (a primary of
	 * a substation template), or the instance of the application it is placed for (a function the
	 * application gained). Its groups are scoped to it, so each is decided on its own. Absent when the
	 * placement is made once.
	 */
	placedFor?: AnyRefOrRecord
	/** Human-readable title of the instance root (`info.of`). */
	title: string
	/** Recognised as an instantiation of the loaded template (provenance or `templateUuid` lineage). */
	linked: boolean
	/**
	 * Nothing to apply for this instance (`groups.length === 0`). It may still carry changes the update keeps
	 * (`keptAttributeChanges` in its `tree`, counted in the report's `summary.kept`).
	 */
	upToDate: boolean
	/** The full diff tree for this instance (unchanged context included). */
	tree: DiffNode
	/** The change tree folded into accept/skip units for this instance. */
	groups: DecisionGroup[]
	/** Where the shared source elements this instance refers to land in the project. */
	mappings: ReportMapping[]
	/**
	 * The template's functional variants the instance did not select (an application instance holding one variant of
	 * a set the template holds several of), as the template holds them. Neither they nor what they bring are added or
	 * listed as changes; there is nothing to decide. Absent when the instance selected nothing.
	 */
	variantsNotSelected?: AnyRefOrRecord[]
}

/** An element a report names: its tag and record id. */
export type ReportedElement = { tagName: string; id?: string }

/**
 * The target a report was made for, as `query.lifecycle.report` reads it: the documents (their record ids), the
 * layer, the template element, where it lands, the operation (`template` when none was asked for) and the instance
 * asked for, if any.
 */
export type ReportTarget = {
	document: string
	source: string
	verb: LifecycleVerb
	ref: ReportedElement
	anchor: ReportedElement
	scenario: LifecycleScenario
	targetInstance?: ReportedElement
}

/** What a report applied to another target differs on first: `report` when it carries no target. */
export type ReportTargetField = keyof ReportTarget | 'report'

export type DiffReport = {
	/**
	 * The target the report was made for, written by `query.lifecycle.report`. `tx.lifecycle.apply` refuses a report
	 * applied to another target, or carrying none (`REPORT_TARGET_MISMATCH`). The per-layer reports the surface is
	 * built from carry none.
	 */
	target?: ReportTarget
	/** One entry per reported instance (`Application`/`Function`). */
	instances: ReportInstance[]
	/**
	 * `false` = fast track (apply headless): a first-time instantiate or nothing changed
	 * anywhere. `true` = full track: some instance has changes to resolve.
	 */
	needsDecisions: boolean
	summary: DiffSummary
	/** Where each shared source element lands in the project — one entry per source element. */
	mappings: ReportMapping[]
	/**
	 * The instances of the template already in the project that the report covers: what an update
	 * reaches (an application, a function, a placed unit), not the functions an application composes.
	 * None on a first placement.
	 */
	templateInstances: AnyRefOrRecord[]
	/**
	 * Set when the consumer started from a level ABOVE the one the template was made for: its content
	 * cannot stay there and lands below, on the levels its placement mappings say.
	 */
	offLevel?: OffLevel
	/**
	 * A fork's report: whether it was given the previous revision of the file (`given`) — an element the project
	 * holds that the newer revision lacks is then removed when the previous revision held it — or not (`absent`):
	 * every such element is listed as the project's own and kept by default, since nothing tells one the newer
	 * revision dropped from one the project added. Absent from the report of another scenario.
	 */
	revisionBase?: 'given' | 'absent'
	/**
	 * The units of an SSD template the report acts on, when the element named comes with the units linked to it by a
	 * reference (a terminal of one on a connectivity node of the other): they are placed and updated together.
	 */
	scopeUnits?: ReportedElement[]
	/** What the report did that the consumer should know of: see {@link ReportWarning}. Absent when nothing. */
	warnings?: ReportWarning[]
}

/**
 * `reference-paired-by-name`: a reference of the project (`reference`) paired with the template's (`source`) by the
 * names of what both name, their uuids disagreeing: the project's target carries the placeholder `lineage`, which the
 * consumer lets pair by name (`Resolution.referencesByName: 'placeholders'`).
 */
export type ReportWarning = {
	code: 'reference-paired-by-name'
	reference: AnyRefOrRecord
	source?: AnyRefOrRecord
	lineage: string
}

/**
 * A user's choice on one decision group. Either a plain accept/skip, or an object
 * carrying edited `values` for the primary's editable attributes (applied on accept —
 * e.g. a user-chosen name that overrides the auto-resolved collision value).
 */
export type GroupDecision =
	| 'accept'
	| 'skip'
	| { action: 'accept' | 'skip'; values?: Record<string, string> }

/**
 * The consumer's decisions, keyed by `DecisionGroup.id`. A group absent from the
 * map takes its `suggestedAction` (accept). So an empty map = accept everything.
 */
export type DecisionMap = Map<string, GroupDecision>

/** A matched node of the diff and the instance element it compares: what a rename is numbered among. */
export type RenamedNode = { node: DiffNode; child: AnyTreeRecord }

/** An added node of the diff and the source element it adds: what is compared with the instance's children. */
export type AddedChild = { node: DiffNode; source: AnyTreeRecord }

/** A node of the diff carrying an identity collision, with it. */
export type NodeIdentityCollision = { node: DiffNode; collision: IdentityCollision }

/** The identities of a source node's own references: by the uuids they name, and by the names of their targets. */
export type SourceRefIdentities = { uuids: Set<string>; names: Set<string> }

/** Whether a leftover instance reference is another instance's link, and the placeholder that paired it by name. */
export type MultiInstanceSibling = { sibling: boolean; pairedByName?: string }
