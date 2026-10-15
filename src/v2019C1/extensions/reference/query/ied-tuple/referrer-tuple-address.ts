import { LN0_LN_CLASS } from './ied-tuple.constants'
import { ownIedName } from './own-ied-name'
import { tuplePairApplies } from './tuple-pair-applies'
import { tupleRoleValue } from './tuple-role-value'
import { tupleTargetKind } from './tuple-target-kind'

import { RELATIVE_IED_NAME } from '@/v2019C1/constants/naming'
import { logicalNodeName } from '@/v2019C1/extensions/reference/query/build/path-segment'
import { readRawAttribute } from '@/v2019C1/extensions/reference/query/build/raw-attribute'

import type { IedRole, TupleReferencePair } from '@/v2019C1/constants/reference-pairs.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The address a tuple reference names (see `targetTupleAddress`), read from the referrer, its text and
 * its ancestors (outermost first). An attribute the referrer leaves out takes its schema value. A
 * control block named without its logical node is in LN0. `undefined` when a part is missing, or
 * when the pair does not apply (one of its `onlyWithout` attributes is set).
 */
export function referrerTupleAddress(params: {
	pair: TupleReferencePair
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}): string | undefined {
	const { pair, record, ancestry } = params
	if (!tuplePairApplies({ record, pair })) return undefined

	const ied = iedNameOf({ role: pair.tuple.ied, record, ancestry })
	if (!ied) return undefined

	switch (tupleTargetKind(pair.tuple)) {
		case 'ap': {
			const accessPoint = tupleRoleValue({ record, pair, role: 'accessPoint' })
			return accessPoint ? `ap:${ied}/${accessPoint}` : undefined
		}
		case 'ld': {
			const lDevice = tupleRoleValue({ record, pair, role: 'lDevice' })
			return lDevice ? `ld:${ied}/${lDevice}` : undefined
		}
		case 'ln': {
			const lDevice = tupleRoleValue({ record, pair, role: 'lDevice' })
			const logicalNode = logicalNodeOf({ record, pair })
			return lDevice && logicalNode ? `ln:${ied}/${lDevice}/${logicalNode}` : undefined
		}
		case 'cb': {
			const lDevice = tupleRoleValue({ record, pair, role: 'lDevice' })
			const logicalNode =
				logicalNodeOf({ record, pair }) ??
				logicalNodeName({ prefix: undefined, lnClass: LN0_LN_CLASS, inst: undefined })
			const controlBlock = tupleRoleValue({ record, pair, role: 'controlBlock' })
			return lDevice && controlBlock
				? `cb:${ied}/${lDevice}/${logicalNode}.${controlBlock}`
				: undefined
		}
	}
}

/** The name of the IED a referrer points into, where its role says to read it. */
function iedNameOf(params: {
	role: IedRole
	record: AnyRawRecord
	ancestry: readonly AnyRawRecord[]
}): string | undefined {
	const { role, record, ancestry } = params
	if ('attribute' in role) {
		const name = readRawAttribute({ record, name: role.attribute })
		return name === RELATIVE_IED_NAME ? ownIedName({ ancestry }) : name
	}
	if ('text' in role) return record.value || undefined
	if ('ancestor' in role) return ownIedName({ ancestry })
	const parent = ancestry.at(-1)
	return parent ? readRawAttribute({ record: parent, name: role.parentAttribute }) : undefined
}

/** The logical node a referrer names, when it names its class. */
function logicalNodeOf(params: {
	record: AnyRawRecord
	pair: TupleReferencePair
}): string | undefined {
	const { record, pair } = params
	const lnClass = tupleRoleValue({ record, pair, role: 'lnClass' })
	if (!lnClass) return undefined
	return logicalNodeName({
		prefix: tupleRoleValue({ record, pair, role: 'prefix' }),
		lnClass,
		inst: tupleRoleValue({ record, pair, role: 'lnInst' }),
	})
}
