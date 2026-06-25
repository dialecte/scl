import { stripAttributes } from '@dialecte/core/helpers'

import type { StripConfig, PromoteRootConfig } from './clone-tree.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

export type { StripConfig, PromoteRootConfig }

const DEFAULT_STRIP: StripConfig = {
	scope: 'tree',
	attributes: ['templateUuid', 'originUuid'],
}

/**
 * Clone pipeline: getTree -> optional promote root tagName -> strip -> deepClone.
 * UUID remapping is handled by afterDeepClone hook via cumulativeCloneMappings.
 *
 * By default strips `templateUuid` and `originUuid` from the entire tree.
 * Pass `strip: false` to disable all stripping.
 * Pass `strip: { scope, attributes }` to customise.
 */
export async function cloneTree(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		ref: Scl.Ref<Scl.ElementsOf>
		targetParent: Scl.Ref<Scl.ElementsOf>
		omit?: OmitEntry<Config>[]
		promoteRoot?: PromoteRootConfig
		strip?: StripConfig | false
	},
): Promise<void> {
	const { sourceQuery, ref, targetParent, omit, promoteRoot, strip = DEFAULT_STRIP } = params

	const tree = await sourceQuery.getTree(ref, { omit })
	if (!tree) return

	const promoted =
		promoteRoot && tree.tagName === promoteRoot.from ? { ...tree, tagName: promoteRoot.to } : tree

	let result = promoted
	if (strip) {
		result =
			strip.scope === 'tree'
				? stripAttributes(promoted, strip.attributes)
				: {
						...promoted,
						attributes: promoted.attributes.filter((a) => !strip.attributes.includes(a.name)),
					}
	}

	// getTree on Scl.Ref<Scl.ElementsOf> includes 'SCL' in the union; deepClone requires
	// a child element. 'SCL' is the document root and never a cloned satellite.
	await tx.deepClone(targetParent, result as Scl.TreeRecord<Exclude<Scl.ElementsOf, 'SCL'>>)
}
