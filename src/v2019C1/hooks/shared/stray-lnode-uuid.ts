import { exclusiveGroupsHeld, groupAttributeNames } from './exclusive-groups'
import { findTargetsByUuid } from './find-targets-by-uuid'
import { PATH_PAIRS_BY_TAG } from './path-references.constants'

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
 * and a `dataName`, when held, naming an LNode alone): the shape a tool writes when it repeats, beside the input or
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
	return { record, lnodeUuid, removed: held, kept, targetUuid }
}

/**
 * For each stray candidate, the LNode holding the element its kept reference names when that LNode is the one its
 * `lnodeUuid` names (the attribute then repeats what the reference names: dropping it loses nothing), else `undefined`.
 * The elements in one lookup per tag (`findTargetsByUuid`), the LNodes above them in one `findAncestorsOfEach` (a read
 * per level, a vendor wrapper kept).
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
			? await reader.findAncestorsOfEach(found as Scl.RawRecord<Scl.ElementsOf>[], {
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
	return candidates.map(function repeatedLNode({ lnodeUuid }, index) {
		const target = targets[index]
		const lnode = target ? lnodeById.get(target.id) : undefined
		return lnode && readAttribute({ record: lnode, name: 'uuid', defaults: 'none' }) === lnodeUuid
			? lnode
			: undefined
	})
}
