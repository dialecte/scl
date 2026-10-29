import {
	CROSS_CUTTING_SATELLITE_CONTAINERS,
	CROSS_CUTTING_SATELLITE_TAGS,
	FRAME_CARRIED_TAGS,
} from './applied-satellites.constants'

import { toRef } from '@dialecte/core/helpers'

import { reference } from '@/v2019C1/extensions/reference'
import { readAttribute } from '@/v2019C1/helpers'

import type { AppliedSatellite, ResolveAppliedSatellitesParams } from './applied-satellites.types'
import type { Config, Scl } from '@/v2019C1/config'
import type * as Core from '@dialecte/core'
import type { AnyTreeRecord } from '@dialecte/core'

/**
 * Resolve the cross-cutting satellites that apply to ANY element within the
 * primary's subtree, and within the subtrees of what it composes (`composedRefs`: the functions an application composes
 * travel with it): for every uuid-bearing element there, find the containers (e.g. `Variable`) referencing it.
 * Excludes containers that live INSIDE those subtrees (internal — already carried by their clone/diff), but, for a
 * topology frame, those its levels hold (`frame`). This is layer-agnostic: any verb passes its primary and gets the
 * applied satellites.
 */
export async function resolveAppliedSatellites(
	query: Core.Query<Config>,
	params: ResolveAppliedSatellitesParams,
): Promise<Scl.Ref<Scl.ElementsOf>[]> {
	const applied = await resolveAppliedSatelliteTargets(query, params)
	return applied.map(function satelliteOf(satellite) {
		return satellite.satelliteRef
	})
}

/**
 * The satellites {@link resolveAppliedSatellites} resolves, each with what it applies to among the targets read (record
 * ids): what a caller tells instances apart by.
 */
export async function resolveAppliedSatelliteTargets(
	query: Core.Query<Config>,
	params: ResolveAppliedSatellitesParams,
): Promise<AppliedSatellite[]> {
	const { primaryRef, composedRefs = [], leftOut } = params
	const tree = await query.any.getTree(primaryRef)
	if (!tree) return []

	const subtreeIds = new Set<string>()
	const targets: AnyTreeRecord[] = []
	collectTargets({ node: tree, subtreeIds, targets })
	for (const composedRef of composedRefs) {
		if (subtreeIds.has(composedRef.id ?? '')) continue
		const composedTree = await query.any.getTree(composedRef)
		if (!composedTree) continue
		// a function left out travels not: nothing applies to it, and what it holds is no satellite either
		const collected = leftOut?.has(composedTree.id) ? [] : targets
		collectTargets({ node: composedTree, subtreeIds, targets: collected })
	}

	// what a level of a frame holds is left out of its clone
	const levelHeld = new Set<string>()
	if (params.frame) collectLevelHeld({ node: tree, levelHeld })

	const satellites = new Map<string, AppliedSatellite>()

	for (const target of targets) {
		if (leftOut?.has(target.id)) continue
		for (const containerTag of CROSS_CUTTING_SATELLITE_CONTAINERS) {
			const refs = await reference.query.findRefsPointingTo(query, {
				target: toRef(target) as Scl.Ref<Scl.ElementsOf>,
				containerTagName: containerTag as Scl.ElementsOf,
			})
			for (const { ref, container } of refs) {
				if (!container || leftOut?.has(ref.id)) continue
				// internal/external guard: a satellite inside the subtree is already carried
				if (subtreeIds.has(container.id) && !levelHeld.has(container.id)) continue
				const known = satellites.get(container.id)
				if (known) known.targetIds.push(target.id)
				else {
					const satelliteRef = toRef(container) as Scl.Ref<Scl.ElementsOf>
					satellites.set(container.id, { satelliteRef, targetIds: [target.id] })
				}
			}
		}
	}
	return [...satellites.values()]
}

function collectTargets(params: {
	node: AnyTreeRecord
	subtreeIds: Set<string>
	targets: AnyTreeRecord[]
}): void {
	const { node, subtreeIds, targets } = params
	subtreeIds.add(node.id)
	// only uuid-bearing elements can be referenced by a uuid satellite
	if (
		readAttribute({ record: node, name: 'uuid', defaults: 'none', fullObject: true }) !== undefined
	)
		targets.push(node)
	for (const child of node.tree) collectTargets({ node: child, subtreeIds, targets })
}

/** The satellites the levels of a frame hold: below it, but in what it places with all it holds (a function). */
function collectLevelHeld(params: { node: AnyTreeRecord; levelHeld: Set<string> }): void {
	const { node, levelHeld } = params
	for (const child of node.tree) {
		if (CROSS_CUTTING_SATELLITE_TAGS.has(child.tagName)) levelHeld.add(child.id)
		else if (!FRAME_CARRIED_TAGS.has(child.tagName)) collectLevelHeld({ node: child, levelHeld })
	}
}
