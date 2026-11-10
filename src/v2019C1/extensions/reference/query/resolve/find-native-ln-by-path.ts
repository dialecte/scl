import { logicalNodePath } from '../build/logical-node-path'
import { buildPathFromAncestry } from '../build/path-segment'
import { toAnyRawRecord } from '../find/collect-with-ancestry.helpers'
import { isNativeStep } from '../find/is-native-step'
import { LOGICAL_NODES_SELECT } from './resolve-mapped-lnodes.constants'

import { orderByConfigSequence } from '@dialecte/core/utils'

import { CHILDREN } from '@/v2019C1/definition/constants.generated'

import type { CollectSelect } from '../find/collect-with-ancestry.types'
import type { NativeLogicalNode } from './find-native-ln.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The first, in document order, of the document's own `LN` or `LN0` of a name path, with its IED,
 * without reading the document: a walk from the root down the elements an IED is read with, entering
 * only those whose own path the given one continues. A `Private` is never entered.
 */
export async function findNativeLnByPath(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: { path: string },
): Promise<NativeLogicalNode | undefined> {
	const root = await query.getRoot()
	return findInChildren(query, {
		chain: [toAnyRawRecord(root)],
		select: LOGICAL_NODES_SELECT,
		path: params.path,
	})
}

/** Depth first, siblings in the order a read lays them out, so the first match is the first in document order. */
async function findInChildren(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: { chain: readonly AnyRawRecord[]; select: CollectSelect; path: string },
): Promise<NativeLogicalNode | undefined> {
	const { chain, select, path } = params
	const holder = chain[chain.length - 1]
	const refs = holder.children.filter((child) => Object.hasOwn(select, child.tagName))
	const read = await query.any.getRecords(refs)
	const children = orderByConfigSequence({
		parentTagName: holder.tagName,
		children: read.filter((record) => record !== undefined),
		childrenConfig: CHILDREN,
	})
	for (const child of children) {
		const record = toAnyRawRecord(child)
		if (!isNativeStep({ element: record, above: holder, root: chain[0] })) continue
		if (child.tagName === 'LN' || child.tagName === 'LN0') {
			if (logicalNodePath({ record, ancestry: chain }) !== path) continue
			return {
				ln: child as Scl.TrackedRecord<'LN' | 'LN0'>,
				ied: { tagName: 'IED', id: chain[1].id },
			}
		}
		if (!continues({ record, chain, path })) continue
		const below = select[child.tagName]
		if (typeof below !== 'object') continue
		const found = await findInChildren(query, { chain: [...chain, record], select: below, path })
		if (found) return found
	}
	return undefined
}

/** Whether the path may name something below the record: its own path, if it has one, starts it. */
function continues(params: {
	record: AnyRawRecord
	chain: readonly AnyRawRecord[]
	path: string
}): boolean {
	const own = buildPathFromAncestry({ record: params.record, ancestry: params.chain })?.path
	return own === undefined || params.path.startsWith(`${own}/`)
}
