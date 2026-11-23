import type { HeldValue, SpecifiedValue, ValueTypes } from '../build/build-input.types'
import type { IedValuePlan, PlannedLogicalNode, ValueLeftOut } from '../transaction/build-ied.types'

/** What the value planner reads: the logical nodes of the plan, what their LNodes specify and what they hold. */
export type PlanValuesParams = {
	logicalNodes: readonly PlannedLogicalNode[]
	specifiedValues: ReadonlyMap<string, readonly SpecifiedValue[]>
	heldValues: ReadonlyMap<string, readonly HeldValue[]>
	valueTypes: ValueTypes
	/** The types only the context document holds. */
	contextTypeIds: ReadonlySet<string>
	excludeFunctionalConstraints: readonly string[]
}

export type PlannedValues = { values: IedValuePlan[]; valuesLeftOut: ValueLeftOut[] }

/** Where a step of a value's path stands in the data types: a data object type or a data attribute type. */
export type TypeStep = { tagName: 'DOType' | 'DAType'; id: string }
