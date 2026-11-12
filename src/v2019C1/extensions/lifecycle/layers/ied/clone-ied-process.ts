import { deep } from '@/v2019C1/extensions/lifecycle/transplant/transaction/deep'

import type { IedProcessPlan } from './ied-process.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Write the planned process part into the target's root: each planned root cloned without what the plan leaves out,
 * with the data types of its LNodes (the source's names kept). Returns the clone mappings, the edits and the
 * identities follow them.
 */
export async function cloneIedProcess(
	tx: Core.Transaction<Config>,
	params: { sourceQuery: Core.Query<Config>; plan: IedProcessPlan },
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, plan } = params
	const targetParent = await tx.getRoot()
	const cloneMappings: Scl.CloneMapping[] = []
	for (const ref of plan.roots) {
		const cloned = await deep(tx, {
			sourceQuery,
			ref,
			targetParent,
			leaveOut: plan.leaveOut,
			withTypes: { keepNameFrom: 'source' },
		})
		cloneMappings.push(...cloned.cloneMappings)
	}
	return cloneMappings
}
