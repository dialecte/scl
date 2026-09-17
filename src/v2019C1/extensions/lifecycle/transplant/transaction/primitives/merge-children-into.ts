import { cloneTree } from './clone-tree'

import { elementSignature } from '@/v2019C1/extensions/signature/query'

import type { StripConfig } from './clone-tree.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

/**
 * Merge the CHILDREN of a source element into an EXISTING target element, REUSING same-tag/same-name
 * child containers recursively instead of cloning duplicates.
 *
 * Generic, element-agnostic counterpart of {@link addChildrenTo}: where `addChildrenTo` pours every
 * source child in as a fresh clone, this walks name-keyed containers (e.g. `FunctionCategory` ->
 * `SubCategory`) and, when a same-tag/same-name child already exists under the target, recurses into
 * it - so only the genuinely new leaves (references, unnamed content) are cloned. A source child with
 * no `name`, or with no matching twin, is cloned whole.
 *
 * `omit` (tag names) drops matching source children from the merge AND from the clones of new leaves,
 * so a caller can merge an element's own content while leaving delegated children to another pass.
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
		omit?: OmitEntry<Config>[]
	},
): Promise<Scl.CloneMapping[]> {
	const { sourceQuery, source, target, strip, omit } = params

	const sourceRecord = await sourceQuery.any.getRecord(source)
	if (!sourceRecord) return []

	const mappings: Scl.CloneMapping[] = []
	for (const childRef of sourceRecord.children) {
		if (isOmittedTag(omit, childRef.tagName)) continue

		const child = { tagName: childRef.tagName, id: childRef.id } as Scl.Ref<Scl.ElementsOf>
		const name = await sourceQuery.any.getAttribute(childRef, { name: 'name' })
		const twin = name ? await findChildByName(tx, target, childRef.tagName, name) : undefined

		if (twin) {
			// A same-tag/same-name container already exists - merge INTO it rather than duplicate it.
			mappings.push(
				...(await mergeChildrenInto(tx, {
					sourceQuery,
					source: child,
					target: twin,
					strip,
					omit,
				})),
			)
			continue
		}

		// A leaf reference (no name-keyed container, e.g. FunctionCatRef) can be reached from several
		// source functions/applications, so the same category is merged more than once. Skip a child
		// that is already present verbatim under the target - otherwise identical refs pile up.
		if (await hasEquivalentChild(tx, target, sourceQuery, child)) continue

		const clone = await cloneTree(tx, {
			sourceQuery,
			ref: child,
			targetParent: target,
			...(omit ? { omit } : {}),
			...(strip === undefined ? {} : { strip }),
		})
		if (clone) mappings.push(...clone.mappings)
	}
	return mappings
}

/** Whether `tagName` matches one of the `omit` entries (string form or single-key object form). */
function isOmittedTag(omit: OmitEntry<Config>[] | undefined, tagName: string): boolean {
	if (!omit) return false
	return omit.some((entry) => (typeof entry === 'string' ? entry === tagName : tagName in entry))
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

/**
 * Whether `target` already holds a same-tag child structurally identical to `child` (a leaf
 * reference). Uses the id-independent element signature, so a child cloned into `target` earlier
 * (with a freshly minted uuid) still matches its source twin and is not cloned again.
 */
async function hasEquivalentChild(
	tx: Core.Transaction<Config>,
	target: Scl.Ref<Scl.ElementsOf>,
	sourceQuery: Core.Query<Config>,
	child: Scl.Ref<Scl.ElementsOf>,
): Promise<boolean> {
	const targetRecord = await tx.any.getRecord(target)
	if (!targetRecord) return false

	const childSignature = await elementSignature(sourceQuery, { ref: child })
	for (const targetChildRef of targetRecord.children) {
		if (targetChildRef.tagName !== child.tagName) continue
		const targetChild = {
			tagName: targetChildRef.tagName,
			id: targetChildRef.id,
		} as Scl.Ref<Scl.ElementsOf>
		if ((await elementSignature(tx, { ref: targetChild })) === childSignature) return true
	}
	return false
}
