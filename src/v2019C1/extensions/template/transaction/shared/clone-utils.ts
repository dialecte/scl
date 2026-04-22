import { stripAttributes } from '@dialecte/core/helpers'

import type { Config, Scl } from '@/v2019C1/config'
import type { ExcludeFilter } from '@dialecte/core'

/** Attributes stripped from every cloned tree before persistence. */
export const STRIP_ATTRS = ['templateUuid', 'originUuid'] as const

/**
 * Clone pipeline: getTree -> strip -> deepClone.
 * UUID remapping is handled by afterDeepClone hook via cumulativeCloneMappings.
 */
export async function cloneTree(
	tx: Scl.Transaction,
	params: {
		sourceQuery: Scl.Query
		ref: Scl.Ref<Scl.ElementsOf>
		targetParent: Scl.Ref<Scl.ElementsOf>
		exclude?: ExcludeFilter<Config>[]
	},
): Promise<void> {
	const { sourceQuery, ref, targetParent, exclude } = params

	const tree = await sourceQuery.getTree(ref, { exclude })
	if (!tree) return

	const strippedTree = stripAttributes(tree, [...STRIP_ATTRS])
	// getTree on Scl.Ref<Scl.ElementsOf> includes 'SCL' in the union; deepClone requires
	// a child element. 'SCL' is the document root and never a cloned satellite.
	await tx.deepClone(targetParent, strippedTree as Scl.TreeRecord<Exclude<Scl.ElementsOf, 'SCL'>>)
}
