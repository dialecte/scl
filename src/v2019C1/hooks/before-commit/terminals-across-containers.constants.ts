import { REF_ENTRIES_BY_TARGET } from '@/v2019C1/extensions/reference'

import type { RefEntry } from '@/v2019C1/extensions/reference/constants/types'

/** The tag of the element a terminal connects to. */
export const CONNECTIVITY_NODE_TAG = 'ConnectivityNode'

/** The references naming a connectivity node (a `Terminal`, a `NeutralPoint`), by referrer tag, from the registry. */
export const NODE_REFERRERS_BY_TAG: ReadonlyMap<string, RefEntry> = new Map(
	(REF_ENTRIES_BY_TARGET.get(CONNECTIVITY_NODE_TAG) ?? []).map((entry) => [
		entry.refTagName,
		entry,
	]),
)

/** A substation: its terminals name its own nodes only. */
export const SUBSTATION_TAG = 'Substation'

/** A line: its terminals name its own nodes, or nodes of a substation. */
export const LINE_TAG = 'Line'

/** The containers a terminal and the node it names belong to: the nearest of these above an element. */
export const TERMINAL_CONTAINER_TAGS: ReadonlySet<string> = new Set([
	SUBSTATION_TAG,
	LINE_TAG,
	'Process',
])
