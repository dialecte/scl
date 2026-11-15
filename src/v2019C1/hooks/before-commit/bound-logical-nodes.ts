import { LOGICAL_NODE_TAGS, WAY_TO_LOGICAL_NODES } from './bound-logical-nodes.constants'
import { readAncestries } from './tuple-names'

import { toRawRecord } from '@dialecte/core/helpers'

import { boundLogicalNodeOf } from '@/v2019C1/extensions/data-model/naming/specification-ied'
import { mappedLNodeKey } from '@/v2019C1/extensions/reference/query/resolve/mapped-lnode-key'
import { readAttributes } from '@/v2019C1/helpers'

import type { BoundLNodes, HeldLogicalNode } from './bound-logical-nodes.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The LNodes given (the ones a commit created or rebound) that the store still holds, and the logical nodes their
 * `lnUuid` name, with the records above each down from its IED. The logical nodes are looked for first in the IEDs
 * the LNodes name (their names agree with their uuid, the common case): the IEDs read by tag once, then the way down to
 * their logical nodes a level at a time. Only a uuid not found there (names naming another IED, or none: a template's placeholder) has
 * every logical node of the document read, once per logical node tag. The records above read a level at a time. A
 * logical node in vendor payload (not native) is left out.
 */
export async function readBoundLNodes(params: {
	query: Core.Query<Config>
	lnodeIds: ReadonlySet<string>
}): Promise<BoundLNodes> {
	const { query, lnodeIds } = params
	const refs = [...lnodeIds].map((id): Scl.Ref<'LNode'> => ({ tagName: 'LNode', id }))
	const lnodes = (await query.getRecords(refs)).flatMap((record) =>
		record ? [toRawRecord(record) as AnyRawRecord] : [],
	)
	const uuids = new Set(
		lnodes.flatMap((record) => {
			const key = mappedLNodeKey(record)
			return key?.kind === 'uuid' ? [key.uuid] : []
		}),
	)
	if (uuids.size === 0) return { lnodes, logicalNodesByUuid: new Map() }

	const inNamedIeds = await readLogicalNodesOfNamedIeds({ query, lnodes, uuids })
	const found = new Set(inNamedIeds.flatMap((record) => uuidOf({ record })))
	const missing = [...uuids].filter((uuid) => !found.has(uuid))
	const elsewhere =
		missing.length > 0 ? await readLogicalNodesByUuid({ query, uuids: missing }) : []
	const logicalNodes = [...inNamedIeds, ...elsewhere]
	const ancestries = await readAncestries({ records: logicalNodes, query })

	// a logical node in vendor payload implements no LNode: left out, as the binding and the specification do
	const logicalNodesByUuid = new Map<string, HeldLogicalNode>()
	for (const record of logicalNodes) {
		const [uuid] = uuidOf({ record })
		const ancestry = ancestries.get(record.id) ?? []
		if (uuid && !logicalNodesByUuid.has(uuid) && boundLogicalNodeOf({ record, ancestry }).native)
			logicalNodesByUuid.set(uuid, { record, ancestry })
	}
	return { lnodes, logicalNodesByUuid }
}

/**
 * The logical nodes named by one of `uuids` among those of the IEDs the LNodes name by `iedName`: the IEDs read by tag,
 * then the way down to their logical nodes a level at a time (access points, servers, logical devices, logical nodes),
 * one read per level whatever the number of IEDs and LNodes.
 */
async function readLogicalNodesOfNamedIeds(params: {
	query: Core.Query<Config>
	lnodes: readonly AnyRawRecord[]
	uuids: ReadonlySet<string>
}): Promise<AnyRawRecord[]> {
	const { query, lnodes, uuids } = params
	const names = new Set(
		lnodes.flatMap((record) => {
			const { iedName } = readAttributes({ record, defaults: 'none' })
			return iedName ? [iedName] : []
		}),
	)
	if (names.size === 0) return []
	let level: AnyRawRecord[] = (await query.getRecordsByTagName('IED')).flatMap((ied) => {
		const { name } = readAttributes({ record: ied, defaults: 'none' })
		return name !== undefined && names.has(name) ? [toRawRecord(ied) as AnyRawRecord] : []
	})
	const logicalNodes: AnyRawRecord[] = []
	while (level.length > 0) {
		const below = level.flatMap((record) =>
			record.children.filter((child) => WAY_TO_LOGICAL_NODES.has(child.tagName)),
		)
		if (below.length === 0) break
		// dialecte-allow query-in-loop: one read per level down to the logical nodes (four at most), whatever the number of IEDs and LNodes
		const read = (await query.getRecords(below as Scl.Ref<Scl.ElementsOf>[])).flatMap((record) =>
			record ? [toRawRecord(record) as AnyRawRecord] : [],
		)
		logicalNodes.push(...read.filter((record) => LOGICAL_NODE_TAGS.has(record.tagName)))
		level = read.filter((record) => !LOGICAL_NODE_TAGS.has(record.tagName))
	}
	return logicalNodes.filter((record) => uuidOf({ record }).some((uuid) => uuids.has(uuid)))
}

/** The logical nodes of the document named by one of `uuids`: one read per logical node tag. */
async function readLogicalNodesByUuid(params: {
	query: Core.Query<Config>
	uuids: readonly string[]
}): Promise<AnyRawRecord[]> {
	const { query, uuids } = params
	const found = [
		...(await query.findByAttributes({ tagName: 'LN', attributes: { uuid: [...uuids] } })),
		...(await query.findByAttributes({ tagName: 'LN0', attributes: { uuid: [...uuids] } })),
	]
	return found.map((record) => toRawRecord(record) as AnyRawRecord)
}

/** A record's uuid, as a list of none or one. */
function uuidOf(params: { record: AnyRawRecord }): string[] {
	const { uuid } = readAttributes({ record: params.record, defaults: 'none' })
	return uuid ? [uuid] : []
}
