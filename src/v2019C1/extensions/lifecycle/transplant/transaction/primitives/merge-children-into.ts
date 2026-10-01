import { cloneTree } from './clone-tree'

import { elementSignature } from '@/v2019C1/extensions/signature/query'

import type { StripConfig } from './clone-tree.types'
import type { MergeChildrenResult } from './merge-children-into.types'
import type { Config, Scl } from '@/v2019C1/config'
import type { RedirectMapping } from '@/v2019C1/extensions/reference/transaction/apply-uuid-remap.types'
import type * as Core from '@dialecte/core'
import type { OmitEntry } from '@dialecte/core'

/**
 * Merge the CHILDREN of a source element into an EXISTING target element, REUSING same-tag/same-name
 * child containers recursively instead of cloning duplicates.
 *
 * Generic, element-agnostic counterpart of {@link addChildrenTo}: where `addChildrenTo` pours every
 * source child in as a fresh clone, this walks name-keyed containers (e.g. `FunctionCategory` ->
 * `SubCategory`) and, when the target already holds the twin of a source child, recurses into it -
 * so only the genuinely new leaves (references, unnamed content) are cloned. The twin is the
 * same-tag child created from that source child (it carries its uuid as `templateUuid`, whatever
 * it is named now), else the same-tag child of the same name - the rule the lifecycle matcher
 * (`matchChild`) applies inside an element the source is mapped onto, so the report and the write
 * pair containers alike. A source child with no twin is cloned whole.
 *
 * `omit` (tag names) drops matching source children from the merge AND from the clones of new leaves,
 * so a caller can merge an element's own content while leaving delegated children to another pass.
 *
 * Returns the clone mappings of what was cloned, and a redirect mapping for every source container
 * that landed on a twin: a reference to that source container is a reference to its twin.
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
): Promise<MergeChildrenResult> {
	const { sourceQuery, source, target, strip, omit } = params

	const cloneMappings: Scl.CloneMapping[] = []
	const redirectMappings: RedirectMapping[] = []

	const sourceRecord = await sourceQuery.any.getRecord(source)
	if (!sourceRecord) return { cloneMappings, redirectMappings }

	for (const childRef of sourceRecord.children) {
		if (isOmittedTag(omit, childRef.tagName)) continue

		const child = { tagName: childRef.tagName, id: childRef.id } as Scl.Ref<Scl.ElementsOf>
		const twin = await findTwin(tx, { sourceQuery, target, child })

		if (twin) {
			// The container already exists - merge INTO it rather than duplicate it.
			const sourceUuid = await sourceQuery.any.getAttribute(child, { name: 'uuid' })
			if (sourceUuid) redirectMappings.push({ sourceUuid, target: twin })
			const merged = await mergeChildrenInto(tx, {
				sourceQuery,
				source: child,
				target: twin,
				strip,
				omit,
			})
			cloneMappings.push(...merged.cloneMappings)
			redirectMappings.push(...merged.redirectMappings)
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
		if (clone) cloneMappings.push(...clone.mappings)
	}
	return { cloneMappings, redirectMappings }
}

/** Whether `tagName` matches one of the `omit` entries (string form or single-key object form). */
function isOmittedTag(omit: OmitEntry<Config>[] | undefined, tagName: string): boolean {
	if (!omit) return false
	return omit.some((entry) => (typeof entry === 'string' ? entry === tagName : tagName in entry))
}

/**
 * The child of `target` a source child lands in: the same-tag child created from it, else the
 * same-tag child of the same name.
 */
async function findTwin(
	tx: Core.Transaction<Config>,
	params: {
		sourceQuery: Core.Query<Config>
		target: Scl.Ref<Scl.ElementsOf>
		child: Scl.Ref<Scl.ElementsOf>
	},
): Promise<Scl.Ref<Scl.ElementsOf> | undefined> {
	const { sourceQuery, target, child } = params

	const targetRecord = await tx.any.getRecord(target)
	if (!targetRecord) return undefined
	const siblings = targetRecord.children.filter((childRef) => childRef.tagName === child.tagName)

	const uuid = await sourceQuery.any.getAttribute(child, { name: 'uuid' })
	if (uuid) {
		for (const sibling of siblings) {
			const lineage = await tx.any.getAttribute(sibling, { name: 'templateUuid' })
			if (lineage === uuid) return toChildRef(sibling)
		}
	}

	const name = await sourceQuery.any.getAttribute(child, { name: 'name' })
	if (!name) return undefined
	for (const sibling of siblings) {
		const siblingName = await tx.any.getAttribute(sibling, { name: 'name' })
		if (siblingName === name) return toChildRef(sibling)
	}
	return undefined
}

function toChildRef(childRef: { tagName: string; id: string }): Scl.Ref<Scl.ElementsOf> {
	return { tagName: childRef.tagName, id: childRef.id } as Scl.Ref<Scl.ElementsOf>
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
