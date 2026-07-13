import { findFunctionInstance } from '../find-instance'

import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'

import type { Scl, Config } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what `update.fromFsd` would change: a {@link DiffReport}
 * with the fast/full classification. No instance yet -> first-time = fast
 * (`needsDecisions: false`); an existing instance with changes -> full.
 */
export async function reportFsd(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		functionRef: Scl.Ref<'Function'>
		targetParent: Scl.Ref<Scl.ElementsOf>
	},
): Promise<DiffReport> {
	const { sourceQuery, functionRef, targetParent } = params
	const { uuid: sourceUuid } = await sourceQuery.getAttributes(functionRef)
	const instance = await findFunctionInstance(query, targetParent, sourceUuid)
	return diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: functionRef,
		instanceRootRef: instance,
	})
}
