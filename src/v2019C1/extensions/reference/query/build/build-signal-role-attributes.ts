import { buildReferenceAttributes } from './build-reference-attributes'
import { isFunctionScoped } from './function-scope'

import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants'
import {
	functionBasesOfFunctionRef,
	resolveByUuid,
} from '@/v2019C1/extensions/reference/query/resolve/resolve-reference-path'

import type { SignalRoleAttributes } from './build-signal-role-attributes.types'
import type { Scl, Config } from '@/v2019C1/config'
import type { ReferencePair } from '@/v2019C1/extensions/reference'
import type * as Core from '@dialecte/core'

/**
 * What the signal role references below a `FunctionRef` hold for the element each names by uuid:
 * their path (written from the function the FunctionRef names) and the attributes they write from the
 * target's path. For a FunctionRef whose target changed, the paths below it follow. Where the
 * references start their path is read once for all. A reference whose uuid names no element holds
 * nothing to rebuild and is left out.
 */
export async function buildSignalRoleAttributes(
	query: Core.Query<Config>,
	params: { functionRef: Scl.Ref<Scl.ElementsOf> },
): Promise<SignalRoleAttributes[]> {
	const descendants = await query.findDescendants(params.functionRef)
	const referrers: { record: Scl.TrackedRecord<Scl.ElementsOf>; pair: ReferencePair }[] = []
	for (const records of Object.values(descendants) as Scl.TrackedRecord<Scl.ElementsOf>[][]) {
		for (const record of records) {
			const pairs: readonly ReferencePair[] | undefined =
				UUID_REFERENCE_PAIRS[record.tagName as keyof typeof UUID_REFERENCE_PAIRS]
			for (const pair of pairs?.filter(isFunctionScoped) ?? []) referrers.push({ record, pair })
		}
	}
	if (referrers.length === 0) return []

	const functionRefRecord = await query.getRecord(params.functionRef)
	if (!functionRefRecord) return []
	const functionBases = await functionBasesOfFunctionRef(query, { functionRef: functionRefRecord })

	const rebuilt: SignalRoleAttributes[] = []
	for (const { record, pair } of referrers) {
		const target = await resolveByUuid(query, record, pair)
		if (!target) continue
		const values = await buildReferenceAttributes(query, {
			reference: { tagName: record.tagName, id: record.id } as Scl.Ref<Scl.ElementsOf>,
			target: { tagName: target.tagName, id: target.id } as Scl.Ref<Scl.ElementsOf>,
			functionBases,
		})
		if (values.length > 0) rebuilt.push({ record, values })
	}
	return rebuilt
}
