import { DATA_SET_SENDER_TAGS } from './data-set-entry.constants'

import { CONF_REV_CONTROL_TAGS } from '@/v2019C1/extensions/lifecycle/layers/ied/bump-data-set-conf-revs.constants'
import { nextConfRev } from '@/v2019C1/extensions/lifecycle/layers/ied/conf-rev'
import { readAttribute } from '@/v2019C1/helpers'

import type { ConfRevRaise, DataSetRemoval } from './data-set-entry.types'
import type { AnyRawRecord } from '@dialecte/core'

/**
 * The configuration revisions a change of a data set's entries raises: each control block given that sends it (one of
 * `CONF_REV_CONTROL_TAGS`, its `datSet` the data set's name) goes one up. A counter that is no unsigned 32-bit number,
 * or would pass its limit, is left as it is. Pure: the caller reads the data set's logical node's control blocks.
 */
export function confRevRaisesOf(params: {
	dataSetName: string
	blocks: readonly AnyRawRecord[]
}): ConfRevRaise[] {
	const { dataSetName, blocks } = params
	return blocks.flatMap((block): ConfRevRaise[] => {
		if (!CONF_REV_CONTROL_TAGS.has(block.tagName)) return []
		if (readAttribute({ record: block, name: 'datSet', defaults: 'none' }) !== dataSetName)
			return []
		const next = nextConfRev({
			value: readAttribute({ record: block, name: 'confRev', defaults: 'none' }),
			step: 1,
		})
		return 'next' in next ? [{ block, confRev: next.next }] : []
	})
}

/**
 * What a data set that goes (its last entry gone, or deleted) leaves its control blocks: each given that sends it (one
 * of `DATA_SET_SENDER_TAGS`, a log control included; its `datSet` the data set's name) loses its `datSet`, an optional
 * reference, and one keeping a configuration revision has it go one up as for any change of the data set reference
 * ({@link confRevRaisesOf}). Pure: the caller reads the control blocks of
 * the data set's logical node; the one rule the delete cascade and a reconcile share.
 */
export function dataSetRemovalsOf(params: {
	dataSetName: string
	blocks: readonly AnyRawRecord[]
}): DataSetRemoval[] {
	const { dataSetName, blocks } = params
	const raised = new Map(
		confRevRaisesOf({ dataSetName, blocks }).map((raise) => [raise.block.id, raise.confRev]),
	)
	return blocks.flatMap((block): DataSetRemoval[] =>
		DATA_SET_SENDER_TAGS.has(block.tagName) &&
		readAttribute({ record: block, name: 'datSet', defaults: 'none' }) === dataSetName
			? [{ block, confRev: raised.get(block.id) }]
			: [],
	)
}
