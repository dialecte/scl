import { toAnyRawRecord } from './collect-with-ancestry.helpers'

import { throwDialecteError } from '@dialecte/core'

import { ROOT_ELEMENT } from '@/v2019C1/definition/constants.generated'

import type { CollectedWithAncestry, CollectFromRootParams } from './collect-with-ancestry.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * Reads a subtree with one `getTree` and lays it flat. The ancestry of an element is the path the
 * walk took to it, never a query; a root below the document root has its own ancestors read once
 * (`findAncestors`). A root below the document root is read by itself, a level at a time (one read
 * per level, whatever the select names); the document root is the whole document, read once.
 */
export async function collectFromTree(
	query: Core.Query<Config>,
	params: CollectFromRootParams,
): Promise<CollectedWithAncestry> {
	const { root, select } = params
	const belowDocumentRoot = root.tagName !== ROOT_ELEMENT
	const tree = await query.any.getTree(root, {
		...(select ? { select } : {}),
		// stopgap until core C6b: getTree with nothing to prune reads the whole document whatever the root
		...(belowDocumentRoot ? { depth: Number.POSITIVE_INFINITY } : {}),
	})
	// `getTree` throws for a root it does not find; its type also allows `undefined` for a missing ref
	if (!tree) throwDialecteError('ELEMENT_NOT_FOUND', { detail: 'No record found for provided ref' })

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
