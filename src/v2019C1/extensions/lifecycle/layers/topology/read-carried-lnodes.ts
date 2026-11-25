import {
	FRAME_OMITTED_CHILD_TAGS,
	LNODE_SECTIONS_SELECT,
	STRUCTURAL_LEVEL_TAGS,
} from './read-carried-lnodes.constants'
import { primariesUnderScope, resolveUnitPlacement } from './scope-content'

import { collectWithAncestry } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry'
import { isNativeNode } from '@/v2019C1/extensions/reference/query/find/is-native-node'

import type {
	CarriedLNodes,
	ReadCarriedLNodesParams,
	WrittenByFrameParams,
} from './read-carried-lnodes.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The LNodes of the document and those an extract of a scope writes: what the scope and the levels below it hold, the
 * own content of the levels above it (what a level holds but its levels, functions, applications and the other
 * elements the function and application layers place: the extract creates those levels with it), and what the
 * functions the scope's applications compose hold, wherever they sit (the unit `cloneTopologyContent` places, read as it
 * reads it). The sections are read once by tag; nothing is kept after the call.
 *
 * @internal
 */
export async function readCarriedLNodes(
	query: Core.Query<Config>,
	params: ReadCarriedLNodesParams,
): Promise<CarriedLNodes> {
	const { scopeRef } = params
	const { applications } = await primariesUnderScope(query, { scopeRef })
	const unit = await resolveUnitPlacement(query, { scopeRef, applicationRefs: applications })
	const { records, ancestryOf } = await collectWithAncestry(query, {
		select: LNODE_SECTIONS_SELECT,
	})
	const levelsAbove = new Set(
		ancestryOf(scopeRef.id).flatMap(function levelId(ancestor) {
			return isLevel(ancestor) ? [ancestor.id] : []
		}),
	)
	const lnodes = records.filter(function isOwnLNode(record) {
		return record.tagName === 'LNode' && isNativeNode({ record, ancestry: ancestryOf(record.id) })
	}) as Scl.TrackedRecord<'LNode'>[]
	const carried = new Set(
		lnodes.flatMap(function carriedId(lnode) {
			const written =
				unit.functionContentIds.has(lnode.id) ||
				writtenByFrame({ lnode, ancestry: ancestryOf(lnode.id), scopeId: scopeRef.id, levelsAbove })
			return written ? [lnode.id] : []
		}),
	)
	return { lnodes, carried }
}

/**
 * Whether the frame of the extract writes an LNode: one inside the scope, or the own content of a level above it (an
 * LNode its nearest level holds, not through a function, an application or another element placed by another layer).
 */
function writtenByFrame(params: WrittenByFrameParams): boolean {
	const { lnode, ancestry, scopeId, levelsAbove } = params
	if (ancestry.some((ancestor) => ancestor.id === scopeId)) return true
	const levelAt = ancestry.findLastIndex(isLevel)
	if (levelAt < 0 || !levelsAbove.has(ancestry[levelAt].id)) return false
	const child = ancestry[levelAt + 1] ?? lnode
	return !FRAME_OMITTED_CHILD_TAGS.has(child.tagName)
}

/** Whether a record is a structural level (Substation, VoltageLevel, Bay). */
function isLevel(record: AnyRawRecord): boolean {
	return STRUCTURAL_LEVEL_TAGS.has(record.tagName)
}
