import { cloneTree } from './clone-tree'

import type { StripConfig } from './clone-tree.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

/**
 * Add the CHILDREN of a source element under an EXISTING target element, instead
 * of cloning the source element itself.
 *
 * Used to reuse a singleton/shared target element (e.g. a `Private` grouping of a
 * given `type`, or a same-name catalog entry) and pour the incoming content into
 * it, rather than producing a duplicate wrapper/entity. Each child is cloned via
 * `cloneTree`, so uuid remapping and reference-path rebuilding still fire.
 */
export async function addChildrenTo(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		/** The source element whose children are copied over. */
		source: Scl.Ref<Scl.ElementsOf>
		/** The existing target element the children are added under. */
		target: Scl.Ref<Scl.ElementsOf>
		omit?: OmitEntry<Config>[]
		strip?: StripConfig | false
	},
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, source, target, omit, strip } = params

	const sourceRecord = await sourceQuery.any.getRecord(source)
	if (!sourceRecord) return []

	const mappings: Scl.CloneMapping[] = []
	for (const childRef of sourceRecord.children) {
		const clone = await cloneTree(tx, {
			sourceQuery,
			ref: { tagName: childRef.tagName, id: childRef.id } as Scl.Ref<Scl.ElementsOf>,
			targetParent: target,
			omit,
			...(strip === undefined ? {} : { strip }),
		})
		if (clone) mappings.push(...clone.mappings)
	}
	return mappings
}
