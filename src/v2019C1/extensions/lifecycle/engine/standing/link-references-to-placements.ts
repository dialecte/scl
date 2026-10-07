import { UUID_REFERENCE_PAIRS } from '@/v2019C1/constants/reference-pairs'

import type { StandingPlacement } from './standing.types'
import type { Config } from '@/v2019C1/config'
import type {
	DecisionGroup,
	DiffNode,
	ReportInstance,
} from '@/v2019C1/extensions/lifecycle/engine/diff.types'
import type * as Core from '@dialecte/core'

/**
 * A reference an instance gains to a child placed for that same instance depends on the placement:
 * the group adding it lists the placement's group in `dependsOn`, so leaving the child out while
 * keeping the reference is refused — a reference never points at nothing.
 */
export async function linkReferencesToPlacements(
	sourceQuery: Core.Query<Config>,
	params: {
		/** The report instances of the container's instances, found by their root's record id. */
		referrers: readonly ReportInstance[]
		placements: readonly StandingPlacement[]
	},
): Promise<void> {
	for (const { placedFor, lineage, reportInstance } of params.placements) {
		const placementGroup =
			reportInstance.groups.find((group) => group.primary === reportInstance.tree) ??
			reportInstance.groups[0]
		const referrer = params.referrers.find((report) => report.rootRef?.id === placedFor)
		if (!placementGroup || !referrer) continue
		for (const group of referrer.groups) {
			if (group.dependsOn.includes(placementGroup.id)) continue
			if (await addsReferenceTo(sourceQuery, { group, lineage })) {
				group.dependsOn.push(placementGroup.id)
			}
		}
	}
}

/** Whether a group adds a reference carrying `lineage` (its uuid side). */
async function addsReferenceTo(
	sourceQuery: Core.Query<Config>,
	params: { group: DecisionGroup; lineage: string },
): Promise<boolean> {
	const { group, lineage } = params
	const pending: DiffNode[] = [group.primary, ...group.companions]
	while (pending.length > 0) {
		const node = pending.pop() as DiffNode
		pending.push(...node.children)
		if (node.change !== 'added' || !node.sourceRef) continue
		const pairs = UUID_REFERENCE_PAIRS[node.tagName as keyof typeof UUID_REFERENCE_PAIRS] ?? []
		for (const pair of pairs) {
			const referenced = await sourceQuery.any.getAttribute(node.sourceRef, {
				name: pair.attribute.uuid,
			})
			if (referenced === lineage) return true
		}
	}
	return false
}
