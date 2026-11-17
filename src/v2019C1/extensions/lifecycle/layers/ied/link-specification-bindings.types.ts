import type { DecisionGroup, DiffNode } from '@/v2019C1/extensions/lifecycle/engine/diff.types'

/** What `linkSpecificationBindings` takes. */
export type LinkSpecificationBindingsParams = {
	/** The groups of the IED's own update. */
	iedGroups: readonly DecisionGroup[]
	/** The groups of its specification's update. */
	specificationGroups: readonly DecisionGroup[]
}

/** A node a group adds, with the group adding it. */
export type AddedNode = { group: DecisionGroup; node: DiffNode }
