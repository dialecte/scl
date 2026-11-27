import { exclusiveGroupsHeld, groupAttributeNames } from './exclusive-groups'
import { findTargetsByUuid } from './find-targets-by-uuid'
import { PATH_PAIRS_BY_TAG } from './path-references.constants'

import { toRef } from '@dialecte/core/helpers'

import { buildElementPaths } from '@/v2019C1/extensions/reference/query/build/build-element-path'
import { dataCompanionsOf } from '@/v2019C1/extensions/reference/query/build/data-companions'
import { toAnyRawRecord } from '@/v2019C1/extensions/reference/query/find/collect-with-ancestry.helpers'
import { splitLnodeQualifier } from '@/v2019C1/extensions/reference/query/resolve/parse-path'
import { readAttribute } from '@/v2019C1/helpers'

import type { StrayLNodeUuid } from './stray-lnode-uuid.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * A behaviour variable holding both its reference groups whose data group is only an `lnodeUuid` (with no data object,
 * and a `dataName`, when held, naming an LNode alone, kept in `dataName`): the shape a tool writes when it repeats, beside the input or
 * output a variable names, the LNode holding that input or output. Its other group is the one it keeps, its uuid the
 * element whose LNode the `lnodeUuid` must be (`targetUuid`). `undefined` for any other record. Pure: the LNode is
 * judged by the caller (`readRepeatedLNodes`, or the import's index).
 */
export function strayLNodeUuidOf(params: { record: AnyRawRecord }): StrayLNodeUuid | undefined {
	const { record } = params
	const pairs = PATH_PAIRS_BY_TAG.get(record.tagName) ?? []
	if (!exclusiveGroupsHeld({ record, pairs })) return undefined
	const data = pairs.find((pair) => dataCompanionsOf(pair).doAttribute !== undefined)
	if (!data) return undefined
	/** The names among `names` the record holds a value for. */
	function heldOf(names: readonly string[]): string[] {
		return names.filter((name) => readAttribute({ record, name, defaults: 'none' }))
	}
	const held = heldOf(groupAttributeNames({ pair: data }))
	const lnodeUuid = readAttribute({ record, name: data.attribute.uuid, defaults: 'none' })
	if (
		!lnodeUuid ||
		held.some((name) => name !== data.attribute.uuid && name !== data.attribute.path)
	)
		return undefined
	const path = readAttribute({ record, name: data.attribute.path, defaults: 'none' })
	if (path && splitLnodeQualifier(path).qualifier) return undefined
	const others = pairs.filter(
		(pair) => pair !== data && heldOf(groupAttributeNames({ pair })).length > 0,
	)
	const [kept] = others
	const targetUuid = kept
		? readAttribute({ record, name: kept.attribute.uuid, defaults: 'none' })
		: ''
	if (others.length !== 1 || !kept || !targetUuid) return undefined
	return { record, lnodeUuid, removed: held, kept, targetUuid, ...(path ? { dataName: path } : {}) }
}

/**
 * For each stray candidate, the LNode holding the element its kept reference names when that LNode is the one its
 * `lnodeUuid` names (the attribute then repeats what the reference names: dropping it loses nothing), else `undefined`.
 * A `dataName` held beside it must name that LNode too ({@link namesLNode}). The elements in one lookup per tag
 * (`findTargetsByUuid`), the LNodes above them in one `findAncestorsOfEach` (a read per level, a vendor wrapper kept),
 * the paths of the LNodes a `dataName` is checked against in one `buildElementPaths`.
 */
export async function readRepeatedLNodes(
	query: Core.Query<Config> | Core.Transaction<Config>,
	params: { candidates: readonly StrayLNodeUuid[] },
): Promise<(AnyRawRecord | undefined)[]> {
	const { candidates } = params
	if (candidates.length === 0) return []
	const reader = query as Core.Query<Config>
	const targets = await findTargetsByUuid(reader, {
		sought: candidates.map(({ targetUuid, kept }) => ({
			uuid: targetUuid,
			targetTagNames: kept.target,
		})),
	})
	const found = targets.flatMap((target) => (target ? [target] : []))
	const ancestries =
		found.length > 0
			? await reader.findAncestorsOfEach(found, {
					stopAtTagName: 'LNode',
					unwrap: [],
				})
			: []
	const lnodeById = new Map(
		found.map((target, index) => [
			target.id,
			(ancestries[index] ?? [])
				.map(toAnyRawRecord)
				.find((ancestor) => ancestor.tagName === 'LNode'),
		]),
	)
	const repeated = candidates.map(function repeatedLNode({ lnodeUuid }, index) {
		const target = targets[index]
		const lnode = target ? lnodeById.get(target.id) : undefined
		return lnode && readAttribute({ record: lnode, name: 'uuid', defaults: 'none' }) === lnodeUuid
			? lnode
			: undefined
	})
	// a dataName held beside it must name that LNode too: one naming another is no repetition
	const named = candidates.flatMap((candidate, index) => {
		const lnode = repeated[index]
		return candidate.dataName && lnode ? [lnode] : []
	})
	const paths =
		named.length > 0
			? await buildElementPaths(reader, {
					refs: named.map((lnode) => toRef(lnode)) as Scl.Ref<Scl.ElementsOf>[],
				})
			: []
	const segmentsById = new Map(
		named.map((lnode, index) => [
			lnode.id,
			(paths[index]?.segments ?? []).map(({ segment }) => segment),
		]),
	)
	return candidates.map(function confirmed({ dataName }, index) {
		const lnode = repeated[index]
		if (!lnode || !dataName) return lnode
		return namesLNode({ dataName, lnodeSegments: segmentsById.get(lnode.id) ?? [] })
			? lnode
			: undefined
	})
}

/**
 * Whether a data-less `dataName` names the LNode whose path segments are `lnodeSegments`: its segments are the last of
 * them (a local path from a level above the LNode, or the whole path). Pure.
 */
export function namesLNode(params: {
	dataName: string
	lnodeSegments: readonly string[]
}): boolean {
	const { dataName, lnodeSegments } = params
	const segments = dataName.split('/')
	if (segments.length > lnodeSegments.length) return false
	const tail = lnodeSegments.slice(lnodeSegments.length - segments.length)
	return segments.every((segment, index) => segment === tail[index])
}
