import type { Config } from '@/v2019C1/config'
import type { OmitEntry } from '@dialecte/core'

/**
 * Base prune list for the **extract** direction only: producing a template drops
 * the source's own provenance refs (`FunctionSclRef`/`ApplicationSclRef`) and
 * equipment. Instantiation omits nothing — composition provenance is preserved.
 */
export const ALWAYS_OMIT: OmitEntry<Config>[] = [
	'FunctionSclRef',
	'ApplicationSclRef',
	'GeneralEquipment',
	'ConductingEquipment',
]

/**
 * Prune list for the **topology (SSD) extract** direction: drops the source's own provenance
 * refs but KEEPS equipment — equipment is the topology layer's own content (unlike ASD/FSD,
 * where it is out-of-layer noise).
 */
export const TOPOLOGY_EXTRACT_OMIT: OmitEntry<Config>[] = ['FunctionSclRef', 'ApplicationSclRef']
