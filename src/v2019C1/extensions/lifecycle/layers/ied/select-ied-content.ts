import { toRef } from '@dialecte/core/helpers'

import { isNativeRecord } from '@/v2019C1/extensions/reference/query/find/is-native-record'
import { readAttribute } from '@/v2019C1/helpers'

import type { IedContentSelection } from './select-ied-content.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { ExtractWarning } from '@/v2019C1/extensions/lifecycle/extract/transaction/extract.types'
import type * as Core from '@dialecte/core'

/** Select schema-qualified instance content before cloning; vendor homonyms stay opaque, warnings name SCL records. */
export async function selectIedContent(
	query: Core.Query<Config>,
	params: { iedRef: Scl.Ref<'IED'>; iedName: string },
): Promise<IedContentSelection> {
	const { iedRef, iedName } = params
	const {
		LN = [],
		IEDName = [],
		ClientLN = [],
		Association = [],
		KDC = [],
		Inputs = [],
	} = await query.findDescendants(iedRef, {
		collect: ['LN', 'IEDName', 'ClientLN', 'Association', 'KDC', 'Inputs'],
	})
	const sclCandidateIds = new Set(
		[...Inputs, ...LN, ...IEDName, ...ClientLN, ...Association, ...KDC]
			.filter(isNativeRecord)
			.map((record) => record.id),
	)
	const leaveOut = new Set(
		Inputs.filter((record) => sclCandidateIds.has(record.id)).map((record) => record.id),
	)
	const warnings: ExtractWarning[] = []
	for (const logicalNode of LN) {
		if (!sclCandidateIds.has(logicalNode.id)) continue
		const lnClass = readAttribute({ record: logicalNode, name: 'lnClass' })
		if (lnClass !== 'LGOS' && lnClass !== 'LSVS') continue
		leaveOut.add(logicalNode.id)
		warnings.push({
			code: 'supervision-left-out',
			source: { ...toRef(logicalNode), id: logicalNode.id },
		})
	}
	for (const receiver of IEDName) {
		if (!sclCandidateIds.has(receiver.id)) continue
		const name = receiver.value
		if (!name || name === iedName) continue
		leaveOut.add(receiver.id)
		warnings.push({
			code: 'ied-reference-left-out',
			source: { ...toRef(receiver), id: receiver.id },
			iedName: name,
		})
	}
	for (const reference of [...ClientLN, ...Association, ...KDC]) {
		if (!sclCandidateIds.has(reference.id)) continue
		const name = readAttribute({ record: reference, name: 'iedName' })
		if (!name || name === iedName) continue
		leaveOut.add(reference.id)
		warnings.push({
			code: 'ied-reference-left-out',
			source: { ...toRef(reference), id: reference.id },
			iedName: name,
		})
	}
	return { leaveOut, warnings }
}
