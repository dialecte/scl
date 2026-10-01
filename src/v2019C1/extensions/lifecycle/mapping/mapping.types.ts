import type { Scl } from '@/v2019C1/config'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * How a shared element of the project is recognised as the one a source element stands for.
 * Declared by the layer that owns the element.
 */
export type MappingPolicy = {
	tagName: Scl.ElementsOf
	/** The attribute a source element and a project element share when they are the same thing. */
	key: 'name'
	/** The consumer may choose another mapping than the one resolved. */
	selectable: boolean
}

/** Why a source element was mapped the way it was. */
export type MappingReason = 'decision' | 'name' | 'none'

/** Where a shared source element lands in the project. */
export type ResolvedMapping = {
	/** The project element the source element maps onto. Absent: a new element is created. */
	existing?: AnyTrackedRecord
	reason: MappingReason
	/** Several project elements qualified equally, so none was picked. */
	ambiguous: boolean
}

/** A project element a shared source element may be mapped onto. */
export type MappingCandidate = {
	ref: Scl.Ref<Scl.ElementsOf>
	title: string
	/** Where the element sits in the project. */
	path: string
}

/** Where one shared source element lands: an element of the project, or a new one. */
export type DecisionMapping = { existing: Scl.Ref<Scl.ElementsOf> } | { create: { name?: string } }

/** The consumer's choices, keyed by the record id of the source element. */
export type MappingDecisionMap = ReadonlyMap<string, DecisionMapping>

/** What the report says about one shared source element. */
export type ReportMapping = {
	/** Record id of the source element; the key of a choice made for it. */
	id: string
	tagName: string
	mapping: DecisionMapping
	reason: MappingReason
	/** Several project elements qualified equally, so none was picked. */
	ambiguous: boolean
	/** The consumer may choose another mapping for this element. */
	selectable: boolean
	/** Every project element this source element could be mapped onto. */
	candidates: MappingCandidate[]
}
