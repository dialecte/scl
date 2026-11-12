import { keptProcessIds } from './kept-process-ids'

import { KEEP_ON_ORPHAN_REFS, UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import { readAttribute } from '@/v2019C1/helpers'

import type { ProcessScope } from './ied-process.types'

/**
 * The references of the written process part that name, by uuid, an element of the section it does not write: a
 * function reference to a function left out, a relation to equipment left out, a reference to a holder left out. Left
 * out with what they hold. A reference whose content is its own (an input or output specification, a data
 * specification, a behaviour variable) stays: its link is cut instead. Only a variable may name what lies outside the
 * section; its applications are decided with it (`selectProcessSatellites`).
 */
export function leaveOutDanglingReferences(scope: ProcessScope): ReadonlySet<string> {
	const { index } = scope
	const kept = keptProcessIds(scope)
	const leaveOut = new Set<string>()
	for (const id of kept) {
		const record = index.byId.get(id)?.record
		if (!record || KEEP_ON_ORPHAN_REFS.has(record.tagName)) continue
		const pairs = UUID_REFERENCE_PAIRS[record.tagName as keyof typeof UUID_REFERENCE_PAIRS] ?? []
		const dangling = pairs.some(function namesLeftOut(pair) {
			const uuid = readAttribute({ record, name: pair.attribute.uuid, defaults: 'none' })
			const target = uuid ? index.byUuid.get(uuid) : undefined
			return target !== undefined && !kept.has(target.record.id)
		})
		if (dangling) leaveOut.add(id)
	}
	return leaveOut
}
