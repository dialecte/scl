import { FRAME_OMIT_CHILD_TAGS, TOPOLOGY_STRUCTURAL_TAGS } from '@/v2019C1/constants'

/** Own content omitted from the frame merge: structural levels (walked) + delegated fn/app content. */
export const FRAME_OWN_CONTENT_OMIT: readonly string[] = [
	...TOPOLOGY_STRUCTURAL_TAGS,
	...FRAME_OMIT_CHILD_TAGS,
]
