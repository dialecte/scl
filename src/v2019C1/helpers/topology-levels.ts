import { TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'

import type { TopologyStructuralTag } from '@/v2019C1/constants'

/**
 * Whether a tag is a level of the topology: a `Substation`, a `VoltageLevel` or a `Bay`; narrows the tag.
 *
 * @intent is this element a topology level (Substation, VoltageLevel, Bay), find the topology levels among ancestors, filter structural levels
 */
export function isTopologyLevel(tagName: string): tagName is TopologyStructuralTag {
	return (TOPOLOGY_STRUCTURAL_TAGS as readonly string[]).includes(tagName)
}
