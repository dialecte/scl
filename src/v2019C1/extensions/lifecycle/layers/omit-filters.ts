import type { Config } from '@/v2019C1/config'
import type { OmitEntry } from '@dialecte/core'

/**
 * Base prune list for the **extract** direction of a function or an application only: producing an FSD / ASD drops the
 * equipment (out-of-layer content for them; the topology layer keeps it). The file references the content records
 * are kept: the extract removes the extracted element's own when it breaks its template link.
 */
export const ALWAYS_OMIT: OmitEntry<Config>[] = ['GeneralEquipment', 'ConductingEquipment']
