import { targetKey } from './target-key'
import { targetTupleParts, tupleAddressOf } from './target-tuple-address'

import { readAttribute } from '@/v2019C1/helpers'

import type { IndexedTarget, TupleTargetIndex } from './ied-tuple.types'
import type { AnyRawRecord } from '@dialecte/core'

/** The targets by address key and by uuid; an address two targets of one tag share names neither. */
export function indexTupleTargets(params: {
	targets: readonly AnyRawRecord[]
	ancestries: ReadonlyMap<string, AnyRawRecord[]>
}): TupleTargetIndex {
	const byAddress = new Map<string, string>()
	const shared = new Set<string>()
	const byUuid = new Map<string, IndexedTarget>()
	for (const record of params.targets) {
		const ancestry = params.ancestries.get(record.id) ?? []
		if (ancestry.some((ancestor) => ancestor.tagName === 'Private')) continue
		const parts = targetTupleParts({ record, ancestry })
		const address = parts ? tupleAddressOf({ parts }) : undefined
		if (!parts || !address) continue
		const uuid = readAttribute({ record, name: 'uuid', defaults: 'none' })
		const key = targetKey({ address, tagName: record.tagName })
		const known = byAddress.get(key)
		if (known !== undefined && known !== uuid) shared.add(key)
		byAddress.set(key, uuid)
		const lineage = new Set([record.id, ...ancestry.map((ancestor) => ancestor.id)])
		byUuid.set(uuid, { id: record.id, tagName: record.tagName, parts, address, lineage })
	}
	for (const key of shared) byAddress.delete(key)
	return { byAddress, byUuid, shared }
}
