import { FIND_RECORD_BY_UUID_PERF_SPAN } from './ref-entry-ops.constants'

import { isElementOf } from '@dialecte/core/helpers'

import { Scl, SCL_DIALECTE_CONFIG, Config } from '@/v2019C1/config'

import type * as Core from '@dialecte/core'

/** The element `uuid` names among `targetTagNames`, the first tag first. */
export async function findTargetByUuid(
	query: Core.Query<Config>,
	params: { uuid: string; targetTagNames: readonly string[] },
): Promise<Scl.Ref<Scl.ElementsOf> | undefined> {
	const match = await findRecordByUuid(query, params)
	return match && ({ tagName: match.tagName, id: match.id } as Scl.Ref<Scl.ElementsOf>)
}

/** The record `uuid` names among `targetTagNames`, the first tag first: the one read, for a caller that needs its attributes. */
export async function findRecordByUuid(
	query: Core.Query<Config>,
	params: { uuid: string; targetTagNames: readonly string[] },
): Promise<Scl.TrackedRecord<Scl.ElementsOf> | undefined> {
	const { uuid, targetTagNames } = params
	query.perf.start(FIND_RECORD_BY_UUID_PERF_SPAN)
	try {
		for (const targetTagName of targetTagNames) {
			if (!isElementOf(targetTagName, SCL_DIALECTE_CONFIG)) continue
			// dialecte-allow query-in-loop: the first target tag holding the uuid wins; later tags are not asked
			const [match] = await query.findByAttributes({ tagName: targetTagName, attributes: { uuid } })
			if (match) return match as Scl.TrackedRecord<Scl.ElementsOf>
		}
		return undefined
	} finally {
		query.perf.stop(FIND_RECORD_BY_UUID_PERF_SPAN)
	}
}
