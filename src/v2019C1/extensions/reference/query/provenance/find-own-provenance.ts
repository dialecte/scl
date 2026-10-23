import { PROVENANCE_ANCHOR_KIND_BY_TAG } from './get-provenance.constants'

import type { OwnProvenance } from './find-own-provenance.types'
import type { Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * The source-file references an element records for itself: the `SclFileReference`s below it whose nearest provenance
 * anchor is the element — the file a function or an application was placed from. The references of the elements it
 * holds that are anchors of their own (a subfunction placed from a function file, a function inside an application)
 * are theirs, not this one's. One read of the element's tree.
 */
export async function findOwnProvenance(
	reader: Core.Query<Config> | Core.Transaction<Config>,
	params: { element: AnyRefOrRecord },
): Promise<OwnProvenance[]> {
	const tree = await reader.any.getTree(params.element)
	return tree ? collectOwnProvenance(tree) : []
}

function collectOwnProvenance(node: AnyTreeRecord): OwnProvenance[] {
	const found: OwnProvenance[] = []
	for (const child of node.tree) {
		if (child.tagName === 'SclFileReference') {
			found.push({ wrapper: node, reference: child })
			continue
		}
		if (child.tagName in PROVENANCE_ANCHOR_KIND_BY_TAG) continue
		found.push(...collectOwnProvenance(child))
	}
	return found
}
