import type { DecisionGroup, DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/** What `markOtherIedBindings` takes. */
export type MarkOtherIedBindingsParams = {
	/** The groups of the specification's update. */
	groups: readonly DecisionGroup[]
	/** What a removal of takes away a binding the project gave another IED: see `SpecificationInstance.unbinding`. */
	unbinding: ReadonlySet<string>
}

/** One group of a report. */
export type GroupParams = { group: DecisionGroup }

/** One node of a report's tree. */
export type NodeParams = { node: DiffNode }
