import type { EditableAttribute } from '../constraints'
import type { AnyRefOrRecord } from '@dialecte/core'

/** How a diffed element changed between the (updated) template and the instance. */
export type DiffChange = 'added' | 'removed' | 'modified' | 'unchanged'

export type AttributeChange = { name: string; before?: string; after?: string }

export type DiffNode = {
	change: DiffChange
	tagName: string
	/** Source (template) element — present for `added` / `modified` / `unchanged`. */
	sourceRef?: AnyRefOrRecord
	/** Instance element — present for `removed` / `modified` / `unchanged`. */
	instanceRef?: AnyRefOrRecord
	/** Attribute deltas — present for `modified`. */
	attributeChanges?: AttributeChange[]
	children: DiffNode[]
}

export type DiffSummary = { added: number; removed: number; modified: number }

/**
 * A decision unit for the full track (ENGINE.md §8, 07 §3.1). The user decides
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
	suggestedAction: 'accept'
	/**
	 * The primary element's user-editable attributes with their edit mode
	 * (schema-derived via the attribute classifier), tagged at report time so the UI
	 * renders inputs directly from the report without re-deriving. Omitted until the
	 * report seam tags it.
	 */
	editableAttributes?: EditableAttribute[]
	/**
	 * The id of the instance root this group belongs to, when several instances of one
	 * template are reported together (multi-instance). Lets the decision layer target a
	 * SUBSET of instances and lets apply partition groups per instance. Omitted for a
	 * first-time instantiate (no instance yet).
	 */
	instanceScopeId?: string
}

export type DiffReport = {
	root: DiffNode
	/** The change tree folded into accept/skip units — the full-track surface. */
	groups: DecisionGroup[]
	/**
	 * `false` = fast track (apply headless): either a first-time instantiate (no
	 * existing instance) or nothing changed. `true` = full track: the instance
	 * exists and something changed, so the caller must resolve decisions.
	 */
	needsDecisions: boolean
	summary: DiffSummary
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
