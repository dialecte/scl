import { toRawRecord } from '@dialecte/core/helpers'

import { ROOT_ELEMENT } from '@/v2019C1/definition/constants.generated'

import type {
	CollectedWithAncestry,
	CollectWithAncestryParams,
} from './collect-with-ancestry.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord, AnyTrackedRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * Reads a subtree once and lays it flat: every element of it in document order, with the records
 * above each, outermost first. One `getTree` is the whole read; the ancestry of an element is the
 * path the walk took to it, never a query. A root below the document root has its own ancestors
 * read once (`findAncestors`).
 *
 * A flat `findDescendants` was measured against it and is not an option: outside a transaction
 * core has no record cache, so it reads the store once per collected element to climb to the root
 * (80 times slower on a document of 11 000 elements).
 */
export async function collectWithAncestry(
	query: Core.Query<Config>,
	params: CollectWithAncestryParams,
): Promise<CollectedWithAncestry> {
	const { root = { tagName: ROOT_ELEMENT }, select } = params
	const tree = await query.any.getTree(root, select && { select })
	if (!tree) return { records: [], ancestryOf: noAncestry }

	const ancestors = tree.parent ? await query.any.findAncestors(root) : []
	const above = [...ancestors].reverse().map(toAnyRawRecord)
	const records: AnyRawRecord[] = []
	const ancestryById = new Map<string, readonly AnyRawRecord[]>()
	flatten({ node: tree, ancestry: above, records, ancestryById })

	function ancestryOf(id: string): readonly AnyRawRecord[] {
		return ancestryById.get(id) ?? []
	}

	return { records, ancestryOf }
}

function noAncestry(): readonly AnyRawRecord[] {
	return []
}

function toAnyRawRecord(record: AnyTrackedRecord | AnyTreeRecord): AnyRawRecord {
	return toRawRecord(record) as AnyRawRecord
}

function flatten(params: {
	node: AnyTreeRecord
	ancestry: readonly AnyRawRecord[]
	records: AnyRawRecord[]
	ancestryById: Map<string, readonly AnyRawRecord[]>
}): void {
	const { node, ancestry, records, ancestryById } = params
	const record = toAnyRawRecord(node)
	records.push(record)
	ancestryById.set(record.id, ancestry)
	const ancestryOfChildren = [...ancestry, record]
	for (const child of node.tree) {
		flatten({ node: child, ancestry: ancestryOfChildren, records, ancestryById })
	}
}
