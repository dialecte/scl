import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'
import { findRefsPointingTo } from '@/v2019C1/extensions/reference/query'

import type { InstanceReader } from './instance.types'
import type { Scl } from '@/v2019C1/config'
import type { AnyRefOrRecord, AnyTreeRecord } from '@dialecte/core'

/**
 * Whether anything outside an instance names an element the instance shares, or is named by it: a reference below
 * the element pointing at an element the instance's scope does not hold (another instance's function a category
 * classifies), or a reference outside that scope pointing at the element (another application's reference to a role).
 * A shared element the template retires stays while this holds: only what the instance gave it goes.
 */
export async function isNamedOutside(
	reader: InstanceReader,
	params: {
		/** The satellite the instance shares. */
		satellite: AnyRefOrRecord
		/** The record ids of what the instance holds and refers to (`collectInstanceScope`). */
		instanceScope: ReadonlySet<string>
	},
): Promise<boolean> {
	const { satellite, instanceScope } = params

	const tree = await reader.any.getTree(satellite)
	if (tree && (await namesOutside(reader, { node: tree, instanceScope }))) return true

	const referrers = await findRefsPointingTo(reader, {
		target: { tagName: satellite.tagName, id: satellite.id } as Scl.Ref<Scl.ElementsOf>,
	})
	return referrers.some(({ ref }) => !instanceScope.has(ref.id))
}

/** Whether a reference at or below `node` points at an element outside the scope. */
async function namesOutside(
	reader: InstanceReader,
	params: { node: AnyTreeRecord; instanceScope: ReadonlySet<string> },
): Promise<boolean> {
	const { node, instanceScope } = params
	const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS] ?? []
	for (const pair of pairs) {
		const referencedUuid = await reader.any.getAttribute(node, { name: pair.attribute.uuid })
		if (!referencedUuid) continue
		for (const tagName of pair.target) {
			const referenced = await reader.any.findByAttributes({
				tagName: tagName as Scl.ElementsOf,
				attributes: { uuid: referencedUuid },
			})
			if (referenced.some((record) => !instanceScope.has(record.id))) return true
		}
	}
	for (const child of node.tree) {
		if (await namesOutside(reader, { node: child, instanceScope })) return true
	}
	return false
}
