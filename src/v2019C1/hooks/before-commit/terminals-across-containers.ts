import { chainOf, isInMovedSubtree } from './moved-roots'
import { UUID_ATTRIBUTE } from './moves.constants'
import {
	CONNECTIVITY_NODE_TAG,
	LINE_TAG,
	NODE_REFERRERS_BY_TAG,
	SUBSTATION_TAG,
	TERMINAL_CONTAINER_TAGS,
} from './terminals-across-containers.constants'

import { readAttribute } from '@/v2019C1/helpers'
import { namesGroundedNode } from '@/v2019C1/helpers/grounded-node'

import type { MovePlaces } from './moved-roots.types'
import type { TerminalContainers } from './terminals-across-containers.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The terminals (and neutral points) the moves leave naming a connectivity node their container may not name, where
 * they named one it may name before: the terminal or the node moved, and the pair turned illegal. A terminal of a
 * substation names the nodes of that substation only; one of a line, the nodes of that line or of any substation; one
 * of a process is not restricted. A pair across containers before the moves is left as it is, and so is a terminal of
 * the grounded node. Read from the document read once, no query.
 */
export function terminalsLeftAcrossContainers(places: MovePlaces): AnyRawRecord[] {
	const nodesByUuid = new Map<string, AnyRawRecord>()
	for (const record of places.document.records) {
		if (record.tagName !== CONNECTIVITY_NODE_TAG) continue
		const uuid = readAttribute({ record, name: UUID_ATTRIBUTE, defaults: 'none' })
		if (uuid) nodesByUuid.set(uuid, record)
	}
	return places.document.records.filter(function turnedIllegal(record) {
		const node = namedNode({ record, nodesByUuid })
		if (!node) return false
		if (!isInMovedSubtree({ places, id: record.id }) && !isInMovedSubtree({ places, id: node.id }))
			return false
		const before = {
			terminal: containerBefore({ places, id: record.id }),
			node: containerBefore({ places, id: node.id }),
		}
		const after = {
			terminal: containerAfter({ places, id: record.id }),
			node: containerAfter({ places, id: node.id }),
		}
		return isLegal(before) && !isLegal(after)
	})
}

/** The node a terminal names by its uuid, none for another element or a terminal of the grounded node. */
function namedNode(params: {
	record: AnyRawRecord
	nodesByUuid: ReadonlyMap<string, AnyRawRecord>
}): AnyRawRecord | undefined {
	const { record, nodesByUuid } = params
	const entry = NODE_REFERRERS_BY_TAG.get(record.tagName)
	if (!entry) return undefined
	const path = readAttribute({ record, name: entry.pathAttr, defaults: 'none' })
	if (namesGroundedNode({ targets: [CONNECTIVITY_NODE_TAG], path })) return undefined
	const uuid = readAttribute({ record, name: entry.uuidAttr, defaults: 'none' })
	return uuid ? nodesByUuid.get(uuid) : undefined
}

/** Whether a terminal's container may name a node of the node's container (unknown containers: nothing to judge). */
function isLegal(containers: TerminalContainers): boolean {
	const { terminal, node } = containers
	if (!terminal || !node) return true
	if (terminal.tagName === SUBSTATION_TAG) return node.id === terminal.id
	if (terminal.tagName === LINE_TAG)
		return node.id === terminal.id || node.tagName === SUBSTATION_TAG
	return true
}

/** The nearest substation, line or process at or above an element, where the commit leaves it. */
function containerAfter(params: { places: MovePlaces; id: string }): AnyRawRecord | undefined {
	return chainOf(params).findLast((record) => TERMINAL_CONTAINER_TAGS.has(record.tagName))
}

/**
 * The nearest substation, line or process at or above an element before the transaction moved it: walked up from where
 * the commit leaves it, each moved element on the way taken back to the parent it came from.
 */
function containerBefore(params: { places: MovePlaces; id: string }): AnyRawRecord | undefined {
	const { places } = params
	for (const record of [...chainOf(params)].reverse()) {
		if (TERMINAL_CONTAINER_TAGS.has(record.tagName)) return record
		const move = places.moved.get(record.id)
		if (move) return containerBefore({ places, id: move.from.id })
	}
	return undefined
}
