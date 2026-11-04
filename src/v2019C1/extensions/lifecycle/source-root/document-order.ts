import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTrackedRecord } from '@dialecte/core'

/**
 * Puts records in document order, the order their parents store them in. Each record is placed by the
 * index of every step of its parent chain, each parent read once however many records stand below it.
 */
export async function sortInDocumentOrder(
	query: Core.Query<Config>,
	params: { records: readonly AnyTrackedRecord[] },
): Promise<AnyTrackedRecord[]> {
	const parents = new Map<string, AnyTrackedRecord | undefined>()
	const positioned: { record: AnyTrackedRecord; position: number[] }[] = []
	for (const record of params.records) {
		const position = await positionOf(query, { record, parents })
		positioned.push({ record, position })
	}
	positioned.sort((first, second) =>
		comparePositions({ first: first.position, second: second.position }),
	)
	return positioned.map((entry) => entry.record)
}

/** The index of the record among the children of each of its ancestors, the document root's child first. */
async function positionOf(
	query: Core.Query<Config>,
	params: { record: AnyTrackedRecord; parents: Map<string, AnyTrackedRecord | undefined> },
): Promise<number[]> {
	const { parents } = params
	const position: number[] = []
	let current = params.record
	while (current.parent) {
		const parentRef = current.parent
		if (!parents.has(parentRef.id)) {
			const read = await query.any.getRecord(parentRef)
			parents.set(parentRef.id, read as AnyTrackedRecord | undefined)
		}
		const parent = parents.get(parentRef.id)
		if (!parent) break
		const id = current.id
		position.unshift(parent.children.findIndex((child) => child.id === id))
		current = parent
	}
	return position
}

function comparePositions(params: { first: readonly number[]; second: readonly number[] }): number {
	const { first, second } = params
	for (let step = 0; step < Math.min(first.length, second.length); step++) {
		if (first[step] !== second[step]) return first[step] - second[step]
	}
	return first.length - second.length
}
