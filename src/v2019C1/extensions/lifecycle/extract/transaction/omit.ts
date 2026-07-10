import { ALWAYS_OMIT } from '@/v2019C1/extensions/lifecycle/layers/omit-filters'

import type { Config } from '@/v2019C1/config'
import type { OmitEntry } from '@dialecte/core'

export const FSD_OMIT: OmitEntry<Config>[] = [
	...ALWAYS_OMIT,
	'DOS',
	'Labels',
	'LNodeInputs',
	'LNodeOutputs',
	'ProcessResources',
	'PowerSystemRelations',
	'BehaviorDescription',
	'Variable',
]
