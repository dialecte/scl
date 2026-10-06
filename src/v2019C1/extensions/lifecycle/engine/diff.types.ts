import type { EditableAttribute } from '../constraints'
import type { OffLevel } from '../layers/topology/resolve-primary-placement.types'
import type { ReportMapping } from '../mapping/mapping.types'
import type { AnyRefOrRecord } from '@dialecte/core'

/** How a diffed element changed between the (updated) template and the instance. */
// `target-only` = an instance element with NO source lineage (author-added after
// instantiation). It is preserved by default and only removed on explicit accept.
export type DiffChange = 'added' | 'removed' | 'modified' | 'unchanged' | 'target-only'

export type AttributeChange = { name: string; before?: string; after?: string }

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
	children: DiffNode[]
}

export type DiffSummary = { added: number; removed: number; modified: number }

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
	/** Coarse label (`"<change> <tag>"`); the UI enriches it via `extractElementTitle(primary.sourceRef ?? instanceRef)`. */
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
	/** Human-readable title of the instance root (`extractElementTitle`). */
	title: string
	/** Recognised as an instantiation of the loaded template (provenance or `templateUuid` lineage). */
	linked: boolean
	/** Nothing to apply for this instance (`groups.length === 0`). */
	upToDate: boolean
	/** The full diff tree for this instance (unchanged context included). */
	tree: DiffNode
	/** The change tree folded into accept/skip units for this instance. */
	groups: DecisionGroup[]
	/** Where the shared source elements this instance refers to land in the project. */
	mappings: ReportMapping[]
}

export type DiffReport = {
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
	 * Set when the consumer started from a level ABOVE the one the template was made for: its content
	 * cannot stay there and lands below, on the levels its placement mappings say.
	 */
	offLevel?: OffLevel
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
