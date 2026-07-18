import { CROSS_CUTTING_SATELLITE_CONTAINERS } from './applied-satellites.constants'

import { toRef } from '@dialecte/core/helpers'

import { reference } from '@/v2019C1/extensions/reference'

import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * Resolve the cross-cutting satellites that apply to ANY element within the
 * primary's subtree: for every uuid-bearing element under `primaryRef`, find the
 * containers (e.g. `Variable`) referencing it. Excludes containers that live
 * INSIDE the subtree (internal — already carried by the primary clone/diff). This
 * is layer-agnostic: any verb passes its primary and gets the applied satellites.
 */
export async function resolveAppliedSatellites(
	query: Core.Query<Config>,
	params: { primaryRef: Scl.Ref<Scl.ElementsOf> },
): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const { primaryRef } = params
	const tree = await query.any.getTree(primaryRef)
	if (!tree) return []

	const subtreeIds = new Set<string>()
	const targets: AnyTreeRecord[] = []
	collectTargets({ node: tree, subtreeIds, targets })

	const seen = new Set<string>()
	const satellites: Scl.Ref<Scl.ElementsOf>[] = []

	for (const target of targets) {
		for (const containerTag of CROSS_CUTTING_SATELLITE_CONTAINERS) {
			const refs = await reference.query.findRefsPointingTo(query, {
				target: toRef(target) as Scl.Ref<Scl.ElementsOf>,
				containerTagName: containerTag as Scl.ElementsOf,
			})
			for (const { container } of refs) {
				if (!container || seen.has(container.id)) continue
				// internal/external guard: a satellite inside the subtree is already carried
				if (subtreeIds.has(container.id)) continue
				seen.add(container.id)
				satellites.push(toRef(container) as Scl.Ref<Scl.ElementsOf>)
			}
		}
	}
	return satellites
}

function collectTargets(params: {
	node: AnyTreeRecord
	subtreeIds: Set<string>
	targets: AnyTreeRecord[]
}): void {
	const { node, subtreeIds, targets } = params
	subtreeIds.add(node.id)
	// only uuid-bearing elements can be referenced by a uuid satellite
	if (node.attributes.some((attribute) => attribute.name === 'uuid')) targets.push(node)
	for (const child of node.tree) collectTargets({ node: child, subtreeIds, targets })
}
