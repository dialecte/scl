import type { ReadHoldingLNodesParams } from './read-holding-lnodes.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Of each record given, the LNode among `lnodeIds` above it, by record id: its parents read a level at a time (one
 * read per level, whatever the number of records), a climb stopping at an LNode or past `depth` levels.
 */
export async function readHoldingLNodes(
	query: Core.Query<Config>,
	params: ReadHoldingLNodesParams,
): Promise<Map<string, string>> {
	const { records, lnodeIds, depth } = params
	const lnodeOf = new Map<string, string>()
	let climbers = records.flatMap((record) =>
		record.parent ? [{ startId: record.id, parent: record.parent }] : [],
	)
	for (let level = 0; level < depth && climbers.length > 0; level++) {
		const next: typeof climbers = []
		const upward: typeof climbers = []
		for (const climber of climbers) {
			if (climber.parent.tagName !== 'LNode') upward.push(climber)
			else if (lnodeIds.has(climber.parent.id)) lnodeOf.set(climber.startId, climber.parent.id)
		}
		const refs = [...new Map(upward.map(({ parent }) => [parent.id, parent])).values()]
		// dialecte-allow query-in-loop: one read per level of the climb (a few levels at most), never per record
		const parents = refs.length > 0 ? await query.getRecords(refs as Scl.Ref<Scl.ElementsOf>[]) : []
		const parentOf = new Map(
			parents.flatMap((record) => (record?.parent ? [[record.id, record.parent] as const] : [])),
		)
		for (const { startId, parent } of upward) {
			const above = parentOf.get(parent.id)
			if (above) next.push({ startId, parent: above })
		}
		climbers = next
	}
	return lnodeOf
}
