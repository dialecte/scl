import { toRawRecord } from '@dialecte/core/helpers'

import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * The `LNodeSpecNaming` of each LNode among `records`, by LNode id, directly under it or in one of
 * its Privates. Two reads whatever the number of LNodes: their Privates, then the namings.
 */
export async function readSpecNamings(
	query: Core.Query<Config>,
	params: { records: readonly Pick<Core.AnyRawRecord, 'id' | 'tagName' | 'children'>[] },
): Promise<Map<string, Core.AnyRawRecord>> {
	const lnodeOf = new Map<string, string>()
	const namingRefs: { id: string; tagName: string }[] = []
	const privateRefs: { id: string; tagName: string }[] = []

	for (const record of params.records) {
		if (record.tagName !== 'LNode') continue
		for (const child of record.children) {
			if (child.tagName === 'LNodeSpecNaming') namingRefs.push(child)
			else if (child.tagName === 'Private') privateRefs.push(child)
			else continue
			lnodeOf.set(child.id, record.id)
		}
	}

	const privates = privateRefs.length > 0 ? await query.getRecords(asRefs(privateRefs)) : []
	for (const privateRecord of privates) {
		if (!privateRecord) continue
		for (const child of privateRecord.children) {
			if (child.tagName !== 'LNodeSpecNaming') continue
			namingRefs.push(child)
			lnodeOf.set(child.id, lnodeOf.get(privateRecord.id) ?? '')
		}
	}

	const namings = namingRefs.length > 0 ? await query.getRecords(asRefs(namingRefs)) : []
	const byLNode = new Map<string, Core.AnyRawRecord>()
	for (const naming of namings) {
		const lnodeId = naming ? lnodeOf.get(naming.id) : undefined
		if (naming && lnodeId && !byLNode.has(lnodeId)) byLNode.set(lnodeId, toRawRecord(naming))
	}
	return byLNode
}

function asRefs(refs: readonly { id: string; tagName: string }[]): Scl.Ref<Scl.ElementsOf>[] {
	return refs as Scl.Ref<Scl.ElementsOf>[]
}
