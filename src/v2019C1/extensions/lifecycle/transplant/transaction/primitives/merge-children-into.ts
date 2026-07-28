import { cloneTree } from './clone-tree'

import type { StripConfig } from './clone-tree.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'

/**
 * Merge the CHILDREN of a source element into an EXISTING target element, REUSING same-tag/same-name
 * child containers recursively instead of cloning duplicates.
 *
 * Generic, element-agnostic counterpart of {@link addChildrenTo}: where `addChildrenTo` pours every
 * source child in as a fresh clone, this walks name-keyed containers (e.g. `FunctionCategory` ->
 * `SubCategory`) and, when a same-tag/same-name child already exists under the target, recurses into
 * it — so only the genuinely new leaves (references, unnamed content) are cloned. A source child with
 * no `name`, or with no matching twin, is cloned whole.
 */
export async function mergeChildrenInto(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		/** The source element whose children are merged over. */
		source: Scl.Ref<Scl.ElementsOf>
		/** The existing target element the children are merged under. */
		target: Scl.Ref<Scl.ElementsOf>
		strip?: StripConfig | false
	},
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, source, target, strip } = params

	const sourceRecord = await sourceQuery.any.getRecord(source)
	if (!sourceRecord) return []

	const mappings: Scl.CloneMapping[] = []
	for (const childRef of sourceRecord.children) {
		const child = { tagName: childRef.tagName, id: childRef.id } as Scl.Ref<Scl.ElementsOf>
		const name = await sourceQuery.any.getAttribute(childRef, { name: 'name' })
		const twin = name ? await findChildByName(tx, target, childRef.tagName, name) : undefined

		if (twin) {
			// A same-tag/same-name container already exists — merge INTO it rather than duplicate it.
			mappings.push(
				...(await mergeChildrenInto(tx, { sourceQuery, source: child, target: twin, strip })),
			)
			continue
		}

		const clone = await cloneTree(tx, {
			sourceQuery,
			ref: child,
			targetParent: target,
			...(strip === undefined ? {} : { strip }),
		})
		if (clone) mappings.push(...clone.mappings)
	}
	return mappings
}

/** The existing same-tag, same-name child under `target` (a shared container), if any. */
async function findChildByName(
	tx: Core.Transaction<Config>,
	target: Scl.Ref<Scl.ElementsOf>,
	tagName: string,
	name: string,
): Promise<Scl.Ref<Scl.ElementsOf> | undefined> {
	const targetRecord = await tx.any.getRecord(target)
	if (!targetRecord) return undefined

	for (const childRef of targetRecord.children) {
		if (childRef.tagName !== tagName) continue
		const childName = await tx.any.getAttribute(childRef, { name: 'name' })
		if (childName === name) {
			return { tagName: childRef.tagName, id: childRef.id } as Scl.Ref<Scl.ElementsOf>
		}
	}
	return undefined
}
