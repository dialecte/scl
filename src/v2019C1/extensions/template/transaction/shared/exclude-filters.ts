import type { Config } from '@/v2019C1/config'
import type { ExcludeFilter } from '@dialecte/core'

export const ALWAYS_EXCLUDE: ExcludeFilter<Config>[] = [
	{ tagName: 'FunctionSclRef' },
	{ tagName: 'ApplicationSclRef' },
	{ tagName: 'GeneralEquipment' },
	{ tagName: 'ConductingEquipment' },
]

export const FSD_EXCLUDE: ExcludeFilter<Config>[] = [
	...ALWAYS_EXCLUDE,
	{ tagName: 'DOS' },
	{ tagName: 'Labels' },
	{ tagName: 'LNodeInputs' },
	{ tagName: 'LNodeOutputs' },
	{ tagName: 'ProcessResources' },
	{ tagName: 'PowerSystemRelations' },
	{ tagName: 'BehaviorDescription' },
	{ tagName: 'Variable' },
]
