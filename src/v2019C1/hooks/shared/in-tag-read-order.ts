import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The records several lookups of one tag answer, each once, in the order the tag read lists them. A lookup answers in
 * that order: the stored records in id order, then those the transaction placed after them (created, or written again
 * after a delete). With one lookup answering, its order is kept; with records the transaction left unchanged only, id
 * order is that order; else the place of a record the transaction wrote is known to the tag read only: the tag is read
 * once for that order.
 */
export async function inTagReadOrder(
	query: Core.Query<Config>,
	params: {
		tagName: Scl.ElementsOf
		lookups: readonly Scl.TrackedRecord<Scl.ElementsOf>[][]
	},
): Promise<Scl.TrackedRecord<Scl.ElementsOf>[]> {
	const { tagName, lookups } = params
	const answering = lookups.filter((records) => records.length > 0)
	if (answering.length <= 1) return answering[0] ?? []
	const byId = new Map(answering.flat().map((record) => [record.id, record]))
	const records = [...byId.values()]
	if (records.every((record) => record.status === 'unchanged')) {
		return records.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
	}
	const tagRecords = await query.getRecordsByTagName(tagName)
	return tagRecords.flatMap((record) => byId.get(record.id) ?? [])
}
