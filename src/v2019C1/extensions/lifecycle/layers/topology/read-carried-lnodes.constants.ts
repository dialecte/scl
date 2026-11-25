import { FRAME_OMIT_CHILD_TAGS, TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'

import type { CollectSelect } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.types'

/** The sections whose LNodes an extract may write: the substations, lines and processes (not a function template). */
export const LNODE_SECTIONS_SELECT = {
	Substation: true,
	Line: true,
	Process: true,
} satisfies CollectSelect

/** The structural levels: Substation, VoltageLevel, Bay. */
export const STRUCTURAL_LEVEL_TAGS: ReadonlySet<string> = new Set(TOPOLOGY_STRUCTURAL_TAGS)

/** What a level holds that its frame does not write as its own content: the other layers place it. */
export const FRAME_OMITTED_CHILD_TAGS: ReadonlySet<string> = new Set(FRAME_OMIT_CHILD_TAGS)
