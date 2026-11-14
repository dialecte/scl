import { readAncestries } from './tuple-names'

import { toRawRecord } from '@dialecte/core/helpers'

import { isAssignedToIed } from '@/v2019C1/extensions/data-model/naming/lnode-naming'
import { readIedKinds } from '@/v2019C1/extensions/lifecycle/ied/classify-ieds'
import { isNativeNode } from '@/v2019C1/extensions/reference/query/find/is-native-node'
import { mappedLNodeKey } from '@/v2019C1/extensions/reference/query/resolve/mapped-lnode-key'
import { readAttributes } from '@/v2019C1/helpers'

import type { Scl, Config } from '@/v2019C1/config'
import type { SpecificationIed } from '@/v2019C1/extensions/data-model/naming/lnode-naming.types'
import type * as Core from '@dialecte/core'
import type { AnyRawRecord, AnyTrackedRecord } from '@dialecte/core'

/**
 * The specification IED each of the LNodes given is bound to, by LNode id, with the logical device it names there.
 * The kind of every IED is read once (by tag): an LNode whose `iedName` names a specification IED (held by no real
 * IED) is specified on it, its logical device its own `ldInst`; one whose `iedName` names no IED of the document (a
 * template's placeholder) is specified on the specification IED holding the logical node its `lnUuid` names, its
 * logical device that logical node's; those are the only logical nodes read. One whose `iedName` names a real IED
 * is on none.
 */
export async function specificationIedsOfCreated(params: {
	query: Core.Query<Config>
	lnodeIds: ReadonlySet<string>
}): Promise<Map<string, SpecificationIed>> {
	const { query, lnodeIds } = params
	const refs = [...lnodeIds].map((id): Scl.Ref<'LNode'> => ({ tagName: 'LNode', id }))
	const lnodes = (await query.getRecords(refs)).filter((record) => record !== undefined)
	const assigned = lnodes.filter((record) => isAssignedToIed({ iedName: iedNameOf(record) }))
	if (assigned.length === 0) return new Map()

	const kinds = await readIedKinds(query)
	const specificationNames = new Map(
		kinds.flatMap((classification) =>
			classification.kind === 'specification'
				? [[classification.ied.id, classification.name] as const]
				: [],
		),
	)
	if (specificationNames.size === 0) return new Map()
	const realNames = new Set(
		kinds.flatMap((classification) =>
			classification.kind === 'implemented' ? [classification.name] : [],
		),
	)
	const specified = new Set([...specificationNames.values()].filter((name) => !realNames.has(name)))
	const heldNames = new Set(kinds.map((classification) => classification.name))

	const found = new Map<string, SpecificationIed>()
	for (const record of assigned) {
		const { iedName, ldInst } = readAttributes({ record, defaults: 'none' })
		if (iedName && specified.has(iedName)) found.set(record.id, { iedName, ldInst })
	}
	const placeholders = assigned.filter((record) => !heldNames.has(iedNameOf(record) ?? ''))
	const byUuid = await specificationIedsByUuid({ query, lnodes: placeholders, specificationNames })
	return new Map([...found, ...byUuid])
}

/** The IED name an LNode names. */
function iedNameOf(record: AnyTrackedRecord): string | undefined {
	return readAttributes({ record, defaults: 'none' }).iedName
}

/**
 * The specification IED of each LNode bound by `lnUuid`: the logical nodes read by tag once, the records above the
 * ones named read a level at a time (`readAncestries`), never an IED's whole subtree.
 */
async function specificationIedsByUuid(params: {
	query: Core.Query<Config>
	lnodes: readonly AnyTrackedRecord[]
	specificationNames: ReadonlyMap<string, string>
}): Promise<Map<string, SpecificationIed>> {
	const { query, lnodes, specificationNames } = params
	const lnodeIdsByUuid = new Map<string, string[]>()
	for (const record of lnodes) {
		const key = mappedLNodeKey(record)
		if (key?.kind === 'uuid')
			lnodeIdsByUuid.set(key.uuid, [...(lnodeIdsByUuid.get(key.uuid) ?? []), record.id])
	}
	if (lnodeIdsByUuid.size === 0) return new Map()

	const logicalNodes = [
		...(await query.getRecordsByTagName('LN')),
		...(await query.getRecordsByTagName('LN0')),
	].flatMap((record) => {
		const raw = toRawRecord(record) as AnyRawRecord
		const uuid = readAttributes({ record: raw, defaults: 'none' }).uuid
		return uuid && lnodeIdsByUuid.has(uuid) ? [{ uuid, record: raw }] : []
	})
	const ancestries = await readAncestries({
		records: logicalNodes.map(({ record }) => record),
		query,
	})

	const found = new Map<string, SpecificationIed>()
	for (const { uuid, record } of logicalNodes) {
		const ancestry = ancestries.get(record.id) ?? []
		const ied = ancestry[0]
		const iedName = ied?.tagName === 'IED' ? specificationNames.get(ied.id) : undefined
		if (!iedName || !isNativeNode({ record, ancestry })) continue
		const lDevice = ancestry.findLast((ancestor) => ancestor.tagName === 'LDevice')
		const ldInst = lDevice && readAttributes({ record: lDevice, defaults: 'none' }).inst
		for (const lnodeId of lnodeIdsByUuid.get(uuid) ?? []) {
			if (!found.has(lnodeId)) found.set(lnodeId, { iedName, ldInst })
		}
	}
	return found
}
