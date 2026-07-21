import { stripAttributes } from '@dialecte/core/helpers'

import type { StripConfig, RetagRootConfig } from './clone-tree.types'
import type { Scl, Config } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

const DEFAULT_STRIP: StripConfig = {
	scope: 'tree',
	attributes: ['templateUuid', 'originUuid'],
}

/**
 * Clone pipeline: getTree -> optional retag root tagName -> strip -> deepClone.
 * UUID remapping is handled by afterDeepClone hook via cumulativeCloneMappings.
 *
 * By default strips `templateUuid` and `originUuid` from the entire tree.
 * Pass `strip: false` to disable all stripping.
 * Pass `strip: { scope, attributes }` to customise.
 *
 * Returns the `CloneResult` (cloned root record + source->target mappings), or
 * `undefined` when the source element does not exist.
 */
export async function cloneTree(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		ref: Scl.Ref<Scl.ElementsOf>
		targetParent: Scl.Ref<Scl.ElementsOf>
		omit?: OmitEntry<Config>[]
		retagRoot?: RetagRootConfig
		strip?: StripConfig | false
	},
): Promise<Core.CloneResult<Config, Exclude<Scl.ElementsOf, 'SCL'>> | undefined> {
	const { sourceQuery, ref, targetParent, omit, retagRoot, strip = DEFAULT_STRIP } = params

	const tree = await sourceQuery.getTree(ref, { omit })
	if (!tree) return undefined

	const retagged =
		retagRoot && tree.tagName === retagRoot.from ? { ...tree, tagName: retagRoot.to } : tree

	let result = retagged
	if (strip) {
		result =
			strip.scope === 'tree'
				? stripAttributes(retagged, strip.attributes)
				: {
						...retagged,
						attributes: retagged.attributes.filter((a) => !strip.attributes.includes(a.name)),
					}
	}

	// getTree on Scl.Ref<Scl.ElementsOf> includes 'SCL' in the union; deepClone requires
	// a child element. 'SCL' is the document root and never a cloned satellite.
	return await tx.deepClone(targetParent, result as Scl.TreeRecord<Exclude<Scl.ElementsOf, 'SCL'>>)
}
