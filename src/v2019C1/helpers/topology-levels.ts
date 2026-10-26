import { TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'

import type { TopologyStructuralTag } from '@/v2019C1/constants'

/** Whether a tag is a level of the topology: a `Substation`, a `VoltageLevel` or a `Bay`. */
export function isTopologyLevel(tagName: string): tagName is TopologyStructuralTag {
	return (TOPOLOGY_STRUCTURAL_TAGS as readonly string[]).includes(tagName)
}
