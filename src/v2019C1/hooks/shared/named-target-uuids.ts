import { readAttribute } from '@/v2019C1/helpers'

import type { TupleReferencePair } from '@/v2019C1/constants'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The uuids by which a tuple reference names one of the targets given (`targetTagByUuid`: each
 * target's uuid and tag), each once: a pair's uuid counts only when the target it names is of a tag
 * the pair can name, so a uuid naming an element of another kind is left out.
 */
export function namedTargetUuids(params: {
	record: AnyRawRecord
	pairs: readonly TupleReferencePair[]
	targetTagByUuid: ReadonlyMap<string, string>
}): string[] {
	const { record, pairs, targetTagByUuid } = params
	const uuids = pairs.flatMap((pair) => {
		const uuid = readAttribute({
			record,
			name: pair.attribute.uuid,
			defaults: 'none',
			fullObject: true,
		})?.value
		const tagName = uuid ? targetTagByUuid.get(uuid) : undefined
		return uuid && tagName && pair.target.includes(tagName) ? [uuid] : []
	})
	return [...new Set(uuids)]
}

/** The entries of `partsByUuid` for the uuids given only. */
export function partsOf<GenericParts>(params: {
	uuids: readonly string[]
	partsByUuid: ReadonlyMap<string, GenericParts>
}): Map<string, GenericParts | undefined> {
	const { uuids, partsByUuid } = params
	return new Map(uuids.map((uuid) => [uuid, partsByUuid.get(uuid)]))
}
