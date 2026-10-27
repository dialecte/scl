import { resolveContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope'
import { findComposedFunctionRefs } from '@/v2019C1/extensions/lifecycle/instance'

import type { Config, Scl } from '@/v2019C1/config'
import type { ContributionScope } from '@/v2019C1/extensions/lifecycle/engine/contribution-scope.types'
import type * as Core from '@dialecte/core'

/**
 * What an application placement places, in the source: the application and the functions it composes, but what the
 * consumer or the instance's selection of variants leaves out (`leftOut`, record ids).
 */
export async function resolveApplicationScope(
	sourceQuery: Core.Query<Config>,
	params: { applicationRef: Scl.Ref<'Application'>; leftOut?: ReadonlySet<string> },
): Promise<ContributionScope> {
	const { applicationRef, leftOut } = params
	const composedFunctionRefs = await findComposedFunctionRefs(sourceQuery, applicationRef)
	return resolveContributionScope(sourceQuery, {
		roots: [applicationRef, ...composedFunctionRefs],
		leftOut,
	})
}
