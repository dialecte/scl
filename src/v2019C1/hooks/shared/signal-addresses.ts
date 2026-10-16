import { SIGNAL_ADDRESS_PAIRS_BY_REF } from './signal-addresses.constants'

import { toRawRecord } from '@dialecte/core/helpers'

import { LNODE_BINDING_ATTRIBUTES } from '@/v2019C1/extensions/reference'
import { buildMappedLNodePath } from '@/v2019C1/extensions/reference/query/build/build-mapped-lnode-path'
import { buildReferenceAttributes } from '@/v2019C1/extensions/reference/query/build/build-reference-attributes'
import { readRawAttributes } from '@/v2019C1/extensions/reference/query/build/raw-attribute'
import {
	hasAttributeChange,
	readSnapshotAttribute,
	updatedOperation,
	withAttributeValues,
} from '@/v2019C1/hooks/shared/record-ops'
import { findTargetByUuid } from '@/v2019C1/hooks/shared/ref-entry-ops'

import type { Scl, Config } from '@/v2019C1/config'
import type { AttributeList } from '@/v2019C1/hooks/shared/record-ops'
import type * as Core from '@dialecte/core'

/**
 * The address a signal of an LNode writes for the element implementing it depends on where that
 * element sits relative to the logical node the LNode is mapped to. When the LNode's binding changes
 * (`lnUuid`, or the naming that stands for it), the address of each of its own signals is written
 * again, from the mapping as `bindingOperations` leave it: the operations `reconcileLNodeBinding`
 * returned, not yet applied.
 *
 * This is the one place where an address that cannot be composed (the element has no internal
 * address) is removed rather than left: the stale one would name another place. Everything rebuilt
 * for a signal lands in one update of it.
 */
export async function reconcileSignalAddresses(
	query: Core.Query<Config>,
	params: {
		oldRecord: Scl.RawRecord<Scl.ElementsOf>
		newRecord: Scl.RawRecord<Scl.ElementsOf>
		bindingOperations: readonly Scl.Operation[]
	},
): Promise<Scl.Operation[]> {
	const { oldRecord, newRecord, bindingOperations } = params
	if (newRecord.tagName !== 'LNode') return []
	if (!hasAttributeChange({ oldRecord, newRecord, names: LNODE_BINDING_ATTRIBUTES })) return []

	const lnode =
		bindingOperations.findLast((operation) => operation.newRecord?.id === newRecord.id)
			?.newRecord ?? newRecord
	const referrerContext = { mappedLnPath: buildMappedLNodePath(readRawAttributes(lnode)) }

	const descendants = await query.findDescendants({ tagName: 'LNode', id: newRecord.id })
	const operations: Scl.Operation[] = []
	for (const [tagName, pairs] of SIGNAL_ADDRESS_PAIRS_BY_REF) {
		for (const signal of descendants[tagName as keyof typeof descendants] ?? []) {
			const record = toRawRecord(signal)
			const reference = { tagName: record.tagName, id: record.id } as Scl.Ref<Scl.ElementsOf>
			let attributes: AttributeList = record.attributes
			for (const pair of pairs) {
				const uuid = readSnapshotAttribute({ record, name: pair.uuidAttr })
				const target = uuid
					? await findTargetByUuid(query, { uuid, targetTagNames: pair.targetTagNames })
					: undefined
				if (!target) continue
				const values = await buildReferenceAttributes(query, { reference, target, referrerContext })
				const hasAddress = values.some((value) => value.name === pair.pathAttr)
				attributes = withAttributeValues(
					attributes,
					hasAddress ? values : [...values, { name: pair.pathAttr, value: undefined }],
				)
			}
			if (attributes !== record.attributes) operations.push(updatedOperation(record, attributes))
		}
	}
	return operations
}
