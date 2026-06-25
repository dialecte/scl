import type { Config } from '@/v2019C1/config'
import type { OmitEntry } from '@dialecte/core'

export const ALWAYS_OMIT: OmitEntry<Config>[] = [
	'FunctionSclRef',
	'ApplicationSclRef',
	'GeneralEquipment',
	'ConductingEquipment',
]
