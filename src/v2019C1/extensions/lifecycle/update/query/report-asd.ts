import { findApplicationInstance } from '../find-instance'

import { diff } from '@/v2019C1/extensions/lifecycle/engine/diff'

import type { Scl, Config } from '@/v2019C1/config'
import type { DiffReport } from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * Report (read-only) what `update.fromAsd` would change to the **Application
 * subtree** (application layer). Fast/full classification as in
 * {@link reportFsd}.
 *
 * NOTE: the composed function-body cascade is not aggregated into this report
 * yet — the report covers the application layer only (follow-up).
 */
export async function reportAsd(
	query: Core.Query<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		applicationRef: Scl.Ref<'Application'>
	},
): Promise<DiffReport> {
	const { sourceQuery, applicationRef } = params
	const { uuid: sourceUuid } = await sourceQuery.getAttributes(applicationRef)
	const instance = await findApplicationInstance(query, sourceUuid)
	return diff({
		sourceQuery,
		targetQuery: query,
		sourceRootRef: applicationRef,
		instanceRootRef: instance,
	})
}
