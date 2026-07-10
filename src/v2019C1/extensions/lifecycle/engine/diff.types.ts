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

export type DiffReport = {
	root: DiffNode
	/**
	 * `false` = fast track (apply headless): either a first-time instantiate (no
	 * existing instance) or nothing changed. `true` = full track: the instance
	 * exists and something changed, so the caller must resolve decisions.
	 */
	needsDecisions: boolean
	summary: DiffSummary
}
