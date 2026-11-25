import { MAPPED_DATA_TAGS } from './read-implementations.constants'
import { implementerOf, readLogicalNodeIndex } from './resolve-mapped-lnodes'

import { UNALLOCATED_IED_NAME } from '@/v2019C1/constants'
import { readAttributes } from '@/v2019C1/helpers'

import type {
	Implementation,
	Implementations,
	ReadImplementationsParams,
} from './read-implementations.types'
import type { LogicalNodeIndex } from './resolve-mapped-lnodes.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Which IED implements each LNode given, with the IED's name and kind: the LN its `lnUuid` or its name path names
 * (`resolveMappedLNodes`' rule), else, for an LNode left unassigned (`iedName` "None" or absent, no `lnUuid`), the LN
 * the `mappedLnUuid` of one of its DOS / SDS / DAS names (a real IED's first, when they name LNs of several IEDs) (several LNodes implemented by one LN keep their specification
 * and document the mapping in their data). The kinds are the classifications given (`classifyIeds`' rule), read once by
 * the caller. A fixed number of reads, whatever the number of LNodes and IEDs; nothing is kept after the call.
 *
 * @internal
 */
export async function readImplementations(
	query: Core.Query<Config>,
	params: ReadImplementationsParams,
): Promise<Implementations> {
	const { lnodes, classifications } = params
	const ieds = classifications.map(({ ied, name, kind }) => ({ ied, name, kind }))
	if (lnodes.length === 0) return { byLNode: new Map(), ieds }

	const iedById = new Map(ieds.map((entry) => [entry.ied.id, entry]))
	const index = await readLogicalNodeIndex(query)
	const byLNode = new Map<string, Implementation>()
	const unassigned: Scl.TrackedRecord<'LNode'>[] = []
	for (const lnode of lnodes) {
		const implementer = implementerOf({ lnode, index })
		const implementation = implementer && iedById.get(implementer.ied.id)
		if (implementation) byLNode.set(lnode.id, implementation)
		else if (isUnassigned({ lnode })) unassigned.push(lnode)
	}

	const viaData = await readImplementedThroughData(query, { lnodes: unassigned, index })
	for (const [lnodeId, iedIds] of viaData) {
		const implementations = iedIds.flatMap((iedId) => iedById.get(iedId) ?? [])
		const implementation =
			implementations.find((entry) => entry.kind === 'implemented') ?? implementations[0]
		if (implementation) byLNode.set(lnodeId, implementation)
	}
	return { byLNode, ieds }
}

/** Whether an LNode is left unassigned: no `lnUuid` deciding alone, and `iedName` "None" or absent. */
function isUnassigned(params: { lnode: Scl.TrackedRecord<'LNode'> }): boolean {
	const { iedName, lnUuid } = readAttributes({ record: params.lnode, defaults: 'none' })
	if (lnUuid) return false
	return iedName === undefined || iedName === UNALLOCATED_IED_NAME
}

/**
 * The ids of the IEDs whose LNs the `mappedLnUuid`s of each LNode's DOS / SDS / DAS name, by LNode id (an LNode none
 * names is absent), read in one walk under every LNode.
 */
async function readImplementedThroughData(
	query: Core.Query<Config>,
	params: { lnodes: readonly Scl.TrackedRecord<'LNode'>[]; index: LogicalNodeIndex },
): Promise<Map<string, string[]>> {
	const { lnodes, index } = params
	const implemented = new Map<string, string[]>()
	if (lnodes.length === 0) return implemented
	const dataOfEach = await query.findDescendantsOfEach(lnodes, { collect: [...MAPPED_DATA_TAGS] })
	lnodes.forEach(function noteImplementer(lnode, position) {
		const groups = dataOfEach[position]
		const data = MAPPED_DATA_TAGS.flatMap((tagName): AnyTrackedRecord[] => groups[tagName] ?? [])
		const iedIds = data.flatMap(function iedNamed(record) {
			const { mappedLnUuid } = readAttributes({ record, defaults: 'none' })
			const mapped = mappedLnUuid ? index.byUuid.get(mappedLnUuid) : undefined
			return mapped ? [mapped.ied.id] : []
		})
		if (iedIds.length > 0) implemented.set(lnode.id, iedIds)
	})
	return implemented
}
