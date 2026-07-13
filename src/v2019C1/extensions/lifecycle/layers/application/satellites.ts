import { toRef } from '@dialecte/core/helpers'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * The application layer's SATELLITE links: elements OUTSIDE the Application subtree
 * that the application references OUTWARD (via a ref inside the app) and that
 * therefore travel with it. Unlike the function layer's reverse-ref satellites
 * (`FunctionCategory` points at the function), these are found by collecting the
 * outward ref inside the application and resolving its target.
 *
 * v1 = `AllocationRole` (via `AllocationRoleRef.allocationRoleUuid`).
 */
const APPLICATION_SATELLITE_LINKS = [
	{ refTag: 'AllocationRoleRef', uuidAttr: 'allocationRoleUuid', targetTag: 'AllocationRole' },
] as const

/**
 * Resolve the application-layer satellites of `applicationRef`: the external
 * targets (e.g. `AllocationRole`) the application references outward. Collects the
 * outward ref uuids inside the Application subtree and resolves each to its source
 * target record. Shared with the report fold and the apply reconcile.
 */
export async function resolveApplicationSatellites(
	query: Core.Query<Config>,
	params: { applicationRef: Scl.Ref<'Application'> },
): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const { applicationRef } = params
	const tree = await query.any.getTree(applicationRef)
	if (!tree) return []

	const seen = new Set<string>()
	const satellites: Scl.Ref<Scl.ElementsOf>[] = []

	for (const link of APPLICATION_SATELLITE_LINKS) {
		const uuids = new Set<string>()
		await collectRefUuids(query, {
			node: tree,
			refTag: link.refTag,
			uuidAttr: link.uuidAttr,
			out: uuids,
		})
		for (const uuid of uuids) {
			const [record] = await query.any.findByAttributes({
				tagName: link.targetTag as Scl.ElementsOf,
				attributes: { uuid },
			})
			if (!record || seen.has(record.id)) continue
			seen.add(record.id)
			satellites.push(toRef(record) as Scl.Ref<Scl.ElementsOf>)
		}
	}
	return satellites
}

async function collectRefUuids(
	query: Core.Query<Config>,
	params: { node: AnyTreeRecord; refTag: string; uuidAttr: string; out: Set<string> },
): Promise<void> {
	const { node, refTag, uuidAttr, out } = params
	if (node.tagName === refTag) {
		const uuid = await query.any.getAttribute(node, { name: uuidAttr })
		if (uuid) out.add(uuid)
	}
	for (const child of node.tree) {
		await collectRefUuids(query, { node: child, refTag, uuidAttr, out })
	}
}
