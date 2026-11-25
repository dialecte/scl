import type {
	BoundLogicalNodeTypes,
	TakeOvers,
} from '@/v2019C1/extensions/lifecycle/contract.types'

/**
 * What the consumer's `Resolution` tells the diff, resolved once (defaults applied) and handed down as ONE object:
 *  - `boundLogicalNodeTypes` — whether a bound logical node takes the type the template gives it;
 *  - `consumerManagedTags` — the element tags a consumer creates on instances and maintains itself: an instance
 *    element of such a tag known not to be the template's is never listed as the project's own (`target-only`).
 */
export type DiffPolicy = {
	boundLogicalNodeTypes: BoundLogicalNodeTypes
	consumerManagedTags: ReadonlySet<string>
	/** The values the project keeps that the consumer takes the template's for (`Resolution.takeOver`). */
	takeOver: TakeOvers
	/**
	 * The source is the document placed into (a copy, as its scenario says): every element of it is held by its uuid,
	 * none brought from another file, and a reference it holds is never one the placement wrote. Another scenario reading
	 * its own document as the source (an instantiate) keeps reading it as a template.
	 */
	sourceIsProject?: true
}
