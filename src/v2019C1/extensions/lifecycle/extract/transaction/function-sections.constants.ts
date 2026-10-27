import type { FunctionSection } from './extract.types'
import type { Config } from '@/v2019C1/config'
import type { OmitEntry } from '@dialecte/core'

/**
 * The elements each optional section of a function is made of, left out at every depth of the function when the
 * section is: what its logical nodes specify (data, inputs, outputs), and what it holds itself. Categories are not in a
 * function: they are placed beside it, or not.
 */
export const FUNCTION_SECTION_TAGS: Readonly<
	Record<Exclude<FunctionSection, 'categories'>, readonly OmitEntry<Config>[]>
> = {
	dataSpecification: ['DOS'],
	labels: ['Labels'],
	inputs: ['LNodeInputs'],
	outputs: ['LNodeOutputs'],
	processResources: ['ProcessResources'],
	powerSystemRelations: ['PowerSystemRelations'],
	behaviorDescriptions: ['BehaviorDescription'],
	variables: ['Variable'],
	equipment: ['GeneralEquipment', 'ConductingEquipment'],
}
